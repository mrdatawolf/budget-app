import { redirect } from 'next/navigation';

/**
 * Sign-in page - Not used in local-only mode.
 * Redirects to home page since no authentication is required.
 */
export default function SignInPage() {
  redirect('/');
}
