import { Box, Container, Typography, Divider, Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <Box sx={{ bgcolor: 'grey.50', minHeight: '100vh', py: 6 }}>
      <Container maxWidth="md">
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Privacy Policy
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Last updated: March 25, 2026
        </Typography>

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="error.main" sx={{ mb: 3, p: 2, bgcolor: 'error.50', border: '1px solid', borderColor: 'error.200', borderRadius: 1 }}>
          ⚠️ <strong>Placeholder document.</strong> This Privacy Policy must be reviewed and finalized by a licensed attorney before use in production. Ensure compliance with applicable laws (CCPA, GDPR, etc.).
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          1. Information We Collect
        </Typography>
        <Typography variant="body1" paragraph>
          We collect information you provide directly (name, email, phone number, address), information generated through your use of the Service (lease data, payment history, maintenance requests), and technical data (IP address, browser type, usage logs).
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          2. How We Use Your Information
        </Typography>
        <Typography variant="body1" paragraph>
          We use your information to provide and improve the Service, process payments, send notifications you have opted into, comply with legal obligations, and communicate service-related updates.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          3. Payment Data
        </Typography>
        <Typography variant="body1" paragraph>
          Payment information is processed by Stripe and is never stored on our servers. We store only payment metadata (amounts, dates, status) necessary for account records. Stripe's privacy policy governs how your payment data is handled.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          4. Data Sharing
        </Typography>
        <Typography variant="body1" paragraph>
          We do not sell your personal information. We share data only with service providers necessary to deliver the Service (payment processors, email providers, cloud storage), and as required by law or legal process.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          5. Communications
        </Typography>
        <Typography variant="body1" paragraph>
          With your consent, we may send you notifications about rent, leases, and maintenance via email or SMS. You may update your communication preferences in your profile settings at any time.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          6. Data Retention
        </Typography>
        <Typography variant="body1" paragraph>
          We retain your data for as long as your account is active or as necessary to provide the Service. Upon account deletion, we will delete or anonymize your personal information within 90 days, except where retention is required by law.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          7. Security
        </Typography>
        <Typography variant="body1" paragraph>
          We implement industry-standard security measures including encryption in transit (HTTPS), encrypted passwords, and access controls. No system is 100% secure — please use a strong, unique password.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          8. Your Rights
        </Typography>
        <Typography variant="body1" paragraph>
          Depending on your jurisdiction, you may have the right to access, correct, delete, or export your personal data. Contact us at privacy@example.com to exercise these rights.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          9. Changes to This Policy
        </Typography>
        <Typography variant="body1" paragraph>
          We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through the Service.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          10. Contact
        </Typography>
        <Typography variant="body1" paragraph>
          For privacy-related questions, contact us at privacy@example.com.
        </Typography>

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to="/terms">Terms of Service</Link> · <Link component={RouterLink} to="/login">Back to Sign In</Link>
        </Typography>
      </Container>
    </Box>
  )
}
