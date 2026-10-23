export const MIN_PASSWORD_LENGTH = 8;

export interface NewAccountValues {
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
}

export const emptyNewAccount: NewAccountValues = {
  firstName: '',
  lastName: '',
  password: '',
  confirmPassword: '',
};

/** True once a confirmation is typed that differs; the fields show this inline. */
export function passwordsDiffer(values: NewAccountValues): boolean {
  return values.confirmPassword.length > 0 && values.password !== values.confirmPassword;
}

/** The first problem with the form, or null when it can be submitted. */
export function newAccountProblem(values: NewAccountValues): string | null {
  if (!values.firstName.trim() || !values.lastName.trim()) return 'Enter your first and last name.';
  if (values.password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (values.password !== values.confirmPassword) return 'Passwords do not match.';
  return null;
}

export function fullName(values: NewAccountValues): string {
  return `${values.firstName.trim()} ${values.lastName.trim()}`;
}
