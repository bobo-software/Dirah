import { MIN_PASSWORD_LENGTH, passwordsDiffer, type NewAccountValues } from '../../utils/newAccount';
import { PasswordField } from './PasswordField';

/** Name, password, and confirm password fields shared by register and invite sign-up. */
export function NewAccountFields({
  values,
  onChange,
}: {
  values: NewAccountValues;
  onChange: (values: NewAccountValues) => void;
}) {
  const set = (key: keyof NewAccountValues) => (value: string) => onChange({ ...values, [key]: value });

  return (
    <>
      <div className="name-row">
        <label>
          First name
          <input
            type="text"
            autoComplete="given-name"
            maxLength={40}
            value={values.firstName}
            onChange={(event) => set('firstName')(event.target.value)}
            required
          />
        </label>
        <label>
          Last name
          <input
            type="text"
            autoComplete="family-name"
            maxLength={39}
            value={values.lastName}
            onChange={(event) => set('lastName')(event.target.value)}
            required
          />
        </label>
      </div>
      <PasswordField
        value={values.password}
        onChange={set('password')}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />
      <PasswordField
        label="Confirm password"
        value={values.confirmPassword}
        onChange={set('confirmPassword')}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />
      {passwordsDiffer(values) ? <p className="error">Passwords do not match.</p> : null}
    </>
  );
}
