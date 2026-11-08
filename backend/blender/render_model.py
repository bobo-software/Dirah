"""
Renders a turnaround of a 3D model for Dirah's media library.

    blender -b --factory-startup --disable-autoexec -P render_model.py -- <input> <out_dir> [size]

Writes <out_dir>/front.png, 34.png, side.png, back.png and stats.json.
Works with Blender 3.4+ (Debian) through 5.x. Cycles on the CPU, so no GPU is needed.
A .blend file is never opened as the main file: its objects are appended into a
clean scene, and --disable-autoexec keeps any embedded scripts from running.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
SIZE = int(args[2]) if len(args) > 2 else 640
os.makedirs(OUT, exist_ok=True)
ext = os.path.splitext(SRC)[1].lower().lstrip('.')


def fail(message):
    with open(os.path.join(OUT, 'stats.json'), 'w') as fh:
        json.dump({'error': message}, fh)
    print('[render_model] ' + message)
    sys.exit(2)


# ---- clean scene
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene

# ---- import
try:
    if ext in ('glb', 'gltf'):
        bpy.ops.import_scene.gltf(filepath=SRC)
    elif ext == 'fbx':
        bpy.ops.import_scene.fbx(filepath=SRC)
    elif ext == 'obj':
        if hasattr(bpy.ops.wm, 'obj_import'):
            bpy.ops.wm.obj_import(filepath=SRC)
        else:
            bpy.ops.import_scene.obj(filepath=SRC)
    elif ext == 'blend':
        with bpy.data.libraries.load(SRC, link=False) as (data_from, data_to):
            data_to.objects = list(data_from.objects)
        for obj in data_to.objects:
            if obj is not None and obj.type not in ('CAMERA', 'LIGHT'):
                scene.collection.objects.link(obj)
    else:
        fail(f'unsupported model type: {ext}')
except Exception as error:  # noqa: BLE001
    fail(f'could not import the model: {error}')

depsgraph = bpy.context.evaluated_depsgraph_get()
meshes = [o for o in scene.objects if o.type == 'MESH']
if not meshes:
    fail('the file has no mesh objects')

# ---- stats and bounds (evaluated, so modifiers and armature poses count)
verts = tris = 0
per_object = []
for obj in meshes:
    ev = obj.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    verts += len(mesh.vertices)
    tris += len(mesh.loop_triangles)
    olo = Vector((math.inf,) * 3)
    ohi = Vector((-math.inf,) * 3)
    for v in mesh.vertices:
        co = ev.matrix_world @ v.co
        olo = Vector(map(min, olo, co))
        ohi = Vector(map(max, ohi, co))
    ev.to_mesh_clear()
    if olo.x != math.inf:
        per_object.append((olo, ohi))


def is_ground(bounds):
    olo, ohi = bounds
    s = ohi - olo
    return s.z <= 0.01 * max(s.x, s.y, 1e-9)


# A flat ground plane saved with the model should not set the framing.
framed = [b for b in per_object if not is_ground(b)] or per_object
lo = Vector((min(b[0].x for b in framed), min(b[0].y for b in framed), min(b[0].z for b in framed)))
hi = Vector((max(b[1].x for b in framed), max(b[1].y for b in framed), max(b[1].z for b in framed)))
size = hi - lo
if max(size) <= 0:
    fail('the model has no size')

stats = {
    'vertices': verts,
    'triangles': tris,
    'bbox': {'x': round(size.x, 4), 'y': round(size.y, 4), 'z': round(size.z, 4)},
    'objects': len(meshes),
    'groundPlanes': len(per_object) - len(framed),
    'rigged': any(o.type == 'ARMATURE' for o in scene.objects),
    'animations': sorted({a.name for a in bpy.data.actions})[:50],
    'materials': len({m.name for o in meshes for m in o.data.materials if m}),
}

# ---- centre on the floor
center = (lo + hi) / 2
offset = Vector((-center.x, -center.y, -lo.z))
for obj in scene.objects:
    if obj.parent is None:
        obj.location += offset
height = size.z
radius = max(size.x, size.y, size.z)

# ---- look
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
try:
    scene.cycles.use_denoising = True
except Exception:  # noqa: BLE001
    pass
scene.render.resolution_x = SIZE
scene.render.resolution_y = int(SIZE * 1.5)
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
transforms = [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items]
scene.view_settings.view_transform = 'AgX' if 'AgX' in transforms else 'Filmic'

world = bpy.data.worlds.new('dirah-world')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.59, 0.57, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8

floor_mat = bpy.data.materials.new('dirah-floor')
floor_mat.use_nodes = True
floor_mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.59, 0.57, 1)
bpy.ops.mesh.primitive_plane_add(size=radius * 40, location=(0, 0, 0))
bpy.context.object.data.materials.append(floor_mat)


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def area(name, loc, energy, light_size, color):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy * radius * radius
    light.size = light_size * radius
    light.color = color
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = Vector(loc) * radius
    aim(obj, (0, 0, height * 0.55))


area('key', (-1.6, -2.2, 2.6), 300, 2.5, (1.0, 0.95, 0.88))
area('fill', (2.0, -1.5, 1.6), 140, 3.0, (0.85, 0.9, 1.0))
area('rim', (0.5, 2.5, 2.4), 200, 1.5, (1.0, 1.0, 1.0))

cam_data = bpy.data.cameras.new('dirah-cam')
cam_data.type = 'ORTHO'
cam_data.clip_end = radius * 100
cam = bpy.data.objects.new('dirah-cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
# Fit the tallest of height and width into the 2:3 frame with a margin.
cam_data.ortho_scale = max(height * 1.15, max(size.x, size.y) * 1.15 * 1.5)

views = [('front', 0), ('34', -35), ('side', -90), ('back', 180)]
for name, deg in views:
    a = math.radians(deg)
    dist = radius * 6
    cam.location = (math.sin(a) * dist, -math.cos(a) * dist, height / 2)
    aim(cam, (0, 0, height / 2))
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as error:
        # Some distro builds (e.g. Debian) ship Cycles without OpenImageDenoise:
        # render without denoising and with more samples instead.
        if 'denoise' not in str(error).lower() or not scene.cycles.use_denoising:
            raise
        scene.cycles.use_denoising = False
        scene.cycles.samples = 64
        bpy.ops.render.render(write_still=True)

with open(os.path.join(OUT, 'stats.json'), 'w') as fh:
    json.dump(stats, fh)
print('[render_model] done', json.dumps(stats))
