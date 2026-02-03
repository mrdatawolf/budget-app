import { redirect } from 'next/navigation';

/**
 * Sign-up page - Not used in local-only mode.
 * Redirects to onboarding since no authentication is required.
 */
export default function SignUpPage() {
  redirect('/onboarding');
}
