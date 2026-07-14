/**
 * TermsPage - displays the Terms of Service.
 *
 * Fetches the server contact email on mount so every deployment shows the
 * admin's own address rather than the hardcoded planly.app placeholder.
 * Back button falls back to '/' when there is no browser history (direct URL).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function TermsPage() {
  const navigate = useNavigate();
  const [contactEmail, setContactEmail] = useState('');

  useEffect(() => {
    api.publicConfig().then(cfg => setContactEmail(cfg.contactEmail)).catch(() => {});
  }, []);

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={goBack}
          className="mb-8 text-sm flex items-center gap-1"
          style={{ color: 'var(--text-3)' }}
        >
          ← Back
        </button>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-3)' }}>
          Last updated: 6 July 2026
        </p>

        <div className="space-y-8" style={{ fontSize: 15, lineHeight: 1.75 }}>

          <section>
            <h2 className="text-lg font-semibold mb-3">1. Acceptance of Terms</h2>
            <p style={{ color: 'var(--text-2)' }}>
              By registering for or using Planly ("the Service"), you agree to be bound by these Terms of
              Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">2. Acceptable Use</h2>
            <p style={{ color: 'var(--text-2)' }}>You agree not to:</p>
            <ul className="mt-2 space-y-1 pl-5 list-disc" style={{ color: 'var(--text-2)' }}>
              <li>Use the Service for any unlawful purpose or in violation of any applicable law.</li>
              <li>Upload or transmit malware, viruses, or any harmful code.</li>
              <li>Attempt to gain unauthorised access to any account, system, or network.</li>
              <li>Scrape, harvest, or systematically extract data from the Service.</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">3. Your Content</h2>
            <p style={{ color: 'var(--text-2)' }}>
              You retain ownership of all content you upload or create through the Service ("Your Content").
              By submitting Your Content, you grant us a limited licence to store, display, and transmit it
              solely as necessary to provide the Service. We do not claim ownership of Your Content and will
              not share it with third parties except as described in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">4. Data Processing</h2>
            <p style={{ color: 'var(--text-2)' }}>
              We process personal data in accordance with our{' '}
              <button
                onClick={() => navigate('/privacy')}
                className="underline"
                style={{ color: 'var(--brand)' }}
              >
                Privacy Policy
              </button>{' '}
              and applicable data protection law (including GDPR where applicable). By using the Service,
              you acknowledge that your personal data will be processed as described therein.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">5. Account Security</h2>
            <p style={{ color: 'var(--text-2)' }}>
              You are responsible for maintaining the confidentiality of your account credentials and for
              all activity that occurs under your account. Notify us immediately at{' '}
              {contactEmail ? (
                <a href={`mailto:${contactEmail}`} style={{ color: 'var(--brand)' }}>
                  {contactEmail}
                </a>
              ) : (
                'the administrator'
              )}{' '}
              if you suspect unauthorised access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">6. Availability and Changes</h2>
            <p style={{ color: 'var(--text-2)' }}>
              We reserve the right to modify, suspend, or discontinue the Service at any time with
              reasonable notice. We will endeavour to provide at least 7 days' notice for material changes
              that affect your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">7. Disclaimer of Warranties</h2>
            <p style={{ color: 'var(--text-2)' }}>
              The Service is provided "as is" without warranties of any kind, express or implied, including
              but not limited to merchantability, fitness for a particular purpose, or non-infringement. We
              do not warrant that the Service will be uninterrupted, error-free, or free of harmful
              components.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">8. Limitation of Liability</h2>
            <p style={{ color: 'var(--text-2)' }}>
              To the maximum extent permitted by applicable law, we shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising from your use of the Service,
              including loss of data, loss of revenue, or business interruption.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">9. Governing Law</h2>
            <p style={{ color: 'var(--text-2)' }}>
              These Terms are governed by and construed in accordance with the laws of Denmark. Any
              disputes shall be subject to the exclusive jurisdiction of the courts of Copenhagen, Denmark.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">10. Contact</h2>
            <p style={{ color: 'var(--text-2)' }}>
              Questions about these Terms may be directed to{' '}
              {contactEmail ? (
                <a href={`mailto:${contactEmail}`} style={{ color: 'var(--brand)' }}>
                  {contactEmail}
                </a>
              ) : (
                'the administrator'
              )}
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
