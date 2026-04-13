import { Box, Container, Typography, Divider, Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

export default function TermsPage() {
  return (
    <Box sx={{ bgcolor: 'grey.50', minHeight: '100vh', py: 6 }}>
      <Container maxWidth="md">
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Terms of Service
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Last updated: March 25, 2026
        </Typography>

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="error.main" sx={{ mb: 3, p: 2, bgcolor: 'error.50', border: '1px solid', borderColor: 'error.200', borderRadius: 1 }}>
          ⚠️ <strong>Placeholder document.</strong> This Terms of Service must be reviewed and finalized by a licensed attorney before use in production.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          1. Acceptance of Terms
        </Typography>
        <Typography variant="body1" paragraph>
          By accessing or using the Property Manager platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          2. Description of Service
        </Typography>
        <Typography variant="body1" paragraph>
          Property Manager is a software-as-a-service (SaaS) platform that enables landlords to manage rental properties, units, leases, and tenants, and enables tenants to view lease information, pay rent, and submit maintenance requests.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          3. User Accounts
        </Typography>
        <Typography variant="body1" paragraph>
          You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account. We are not liable for losses arising from unauthorized account access.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          4. Payment Processing
        </Typography>
        <Typography variant="body1" paragraph>
          Payment processing services are provided by Stripe. By using payment features, you agree to Stripe's Terms of Service. We are not responsible for payment processing errors, failures, or delays caused by Stripe or your financial institution.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          5. Prohibited Uses
        </Typography>
        <Typography variant="body1" paragraph>
          You may not use the Service to violate any applicable laws, infringe on intellectual property rights, transmit malicious code, or engage in fraudulent activity.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          6. Termination
        </Typography>
        <Typography variant="body1" paragraph>
          We reserve the right to suspend or terminate your account for violation of these terms or for any other reason at our discretion, with or without notice.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          7. Limitation of Liability
        </Typography>
        <Typography variant="body1" paragraph>
          To the maximum extent permitted by law, the Service is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, special, or consequential damages.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          8. Changes to Terms
        </Typography>
        <Typography variant="body1" paragraph>
          We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.
        </Typography>

        <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
          9. Contact
        </Typography>
        <Typography variant="body1" paragraph>
          For questions about these Terms, contact us at support@example.com.
        </Typography>

        <Divider sx={{ my: 3 }} />

        <Typography variant="body2" color="text.secondary">
          <Link component={RouterLink} to="/privacy">Privacy Policy</Link> · <Link component={RouterLink} to="/login">Back to Sign In</Link>
        </Typography>
      </Container>
    </Box>
  )
}
