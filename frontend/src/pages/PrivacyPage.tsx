/**
 * PrivacyPage - displays the Privacy Policy.
 *
 * Fetches the server contact email on mount so every deployment shows the
 * admin's own address rather than the hardcoded planly.app placeholder.
 * Back button falls back to '/' when there is no browser history (direct URL).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function PrivacyPage() {
  const navigate = useNavigate();
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    api
      .publicConfig()
      .then((cfg) => setContactEmail(cfg.contactEmail))
      .catch(() => {});
  }, []);

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  function EmailLink() {
    if (!contactEmail) return <>the administrator</>;
    return (
      <a href={`mailto:${contactEmail}`} style={{ color: 'var(--brand)' }}>
        {contactEmail}
      </a>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button onClick={goBack} className="mb-8 text-sm flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
          ← Back
        </button>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-3)' }}>
          Last updated: 6 July 2026
        </p>

        <div className="space-y-8" style={{ fontSize: 15, lineHeight: 1.75 }}>
          <section>
            <h2 className="text-lg font-semibold mb-3">1. Who We Are</h2>
            <p style={{ color: 'var(--text-2)' }}>
              Planly ("we", "our", "the Service") is a project management platform. For questions about your personal
              data, contact us at <EmailLink />.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. Data We Collect</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ color: 'var(--text-2)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--text)' }}>
                      Data
                    </th>
                    <th className="text-left py-2 pr-4 font-semibold" style={{ color: 'var(--text)' }}>
                      Purpose
                    </th>
                    <th className="text-left py-2 font-semibold" style={{ color: 'var(--text)' }}>
                      Legal Basis
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  <tr>
                    <td className="py-2 pr-4">Email address</td>
                    <td className="py-2 pr-4">Account authentication, notifications</td>
                    <td className="py-2">Contract performance</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Username</td>
                    <td className="py-2 pr-4">Identity within the platform</td>
                    <td className="py-2">Contract performance</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Real name, phone (optional)</td>
                    <td className="py-2 pr-4">Team directory display</td>
                    <td className="py-2">Consent (voluntary fields)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Task and message content</td>
                    <td className="py-2 pr-4">Core product functionality</td>
                    <td className="py-2">Contract performance</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Activity logs</td>
                    <td className="py-2 pr-4">Audit trail, security</td>
                    <td className="py-2">Legitimate interest</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">IP address (server logs)</td>
                    <td className="py-2 pr-4">Security, abuse prevention</td>
                    <td className="py-2">Legitimate interest</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4" style={{ color: 'var(--text-2)' }}>
              We do not use third-party analytics, advertising, or tracking scripts. No cookies beyond the session
              authentication cookie are set.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. Data Retention</h2>
            <p style={{ color: 'var(--text-2)' }}>Automated retention windows enforced by the platform:</p>
            <ul className="mt-2 space-y-1 pl-5 list-disc" style={{ color: 'var(--text-2)' }}>
              <li>
                Notifications: deleted after <strong>90 days</strong>
              </li>
              <li>
                Activity log entries: deleted after <strong>180 days</strong>
              </li>
              <li>
                Soft-deleted tasks: permanently deleted after <strong>365 days</strong>
              </li>
              <li>
                Admin audit logs: deleted after <strong>90 days by default</strong> (configurable per deployment via{' '}
                <code>ADMIN_LOG_RETENTION_DAYS</code>)
              </li>
              <li>Active account data: retained until account deletion is requested</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. How We Protect Your Data</h2>
            <ul className="space-y-1 pl-5 list-disc" style={{ color: 'var(--text-2)' }}>
              <li>Sensitive fields (real name, phone number) are encrypted at rest using AES-256-GCM.</li>
              <li>
                All traffic is encrypted in transit using TLS 1.2 or higher (TLS 1.3 negotiated where supported by the
                client).
              </li>
              <li>Passwords are hashed using bcrypt (cost factor 12).</li>
              <li>Session tokens are stored in httpOnly, SameSite=Lax cookies.</li>
              <li>Database backups are encrypted before offsite storage.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. Your Rights (GDPR)</h2>
            <p style={{ color: 'var(--text-2)' }}>
              If you are located in the EEA or UK, you have the following rights:
            </p>
            <ul className="mt-2 space-y-1 pl-5 list-disc" style={{ color: 'var(--text-2)' }}>
              <li>
                <strong>Right of access (Art. 15):</strong> Request a copy of all personal data held about you - see
                portability (Art. 20) below for the self-service export option.
              </li>
              <li>
                <strong>Right to erasure (Art. 17):</strong> Delete your account via Settings → Delete Account. Your
                profile, messages, and notifications are permanently deleted. Tasks you were assigned to or created
                remain in the project (they belong to your team) but your name is removed from them. Announcements you
                authored remain visible but are attributed to "Deleted user".
              </li>
              <li>
                <strong>Right to data portability (Art. 20):</strong> Download a complete JSON export of all data held
                about you: profile, every task you created or are assigned to, all messages and comments you authored,
                team memberships, notifications, and API token names. Available any time via Settings → Export my data.
              </li>
              <li>
                <strong>Right to rectification (Art. 16):</strong> Update your profile at any time via Settings.
              </li>
              <li>
                <strong>Right to restriction and objection (Arts. 18–21):</strong> Contact us at <EmailLink />.
              </li>
            </ul>
            <p className="mt-4" style={{ color: 'var(--text-2)' }}>
              We will respond to all requests within 30 days. You also have the right to lodge a complaint with your
              national supervisory authority (e.g. Datatilsynet for Danish residents).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. Data Sharing</h2>
            <p style={{ color: 'var(--text-2)' }}>
              We do not sell or share your personal data with third parties for their own marketing purposes. Data may
              be shared with:
            </p>
            <ul className="mt-2 space-y-1 pl-5 list-disc" style={{ color: 'var(--text-2)' }}>
              <li>Your organisation's team members (task and message content you create).</li>
              <li>
                Infrastructure providers (hosting, email delivery) acting as data processors under appropriate data
                processing agreements.
              </li>
              <li>Law enforcement, when required by applicable law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. Cookies</h2>
            <p style={{ color: 'var(--text-2)' }}>
              We set a single httpOnly session cookie (`token`) strictly necessary for authentication. No third-party
              cookies, tracking pixels, or analytics cookies are used. No cookie consent banner is required for this
              reason.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. Contact & Data Subject Requests</h2>
            <p style={{ color: 'var(--text-2)' }}>
              To exercise your rights or to submit a data subject access request (DSAR), email <EmailLink /> with your
              account email address and a description of your request. We will verify your identity and respond within
              30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">9. Changes to This Policy</h2>
            <p style={{ color: 'var(--text-2)' }}>
              We will notify registered users by email of any material changes to this Privacy Policy at least 14 days
              before they take effect. Continued use of the Service after the effective date constitutes acceptance of
              the updated policy.
            </p>
          </section>
        </div>

        <p className="mt-12 text-xs" style={{ color: 'var(--text-3)' }}>
          Version 1.0 · Effective 6 July 2026
        </p>
      </div>
    </div>
  );
}
