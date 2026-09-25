import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { Link } from "react-router-dom";

function PrivacyPolicy() {
  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#f8f9fa", py: { xs: 3, md: 7 } }}>
      <Container maxWidth="md">
        <Card sx={{ p: { xs: 3, md: 6 } }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Privacy Policy
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Last updated: 25 September 2026
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom>Information we collect</Typography>
          <Typography paragraph>
            EduNextG Sales collects the information needed to operate sales, inventory, payment,
            delivery, outlet, and staff management features. This may include account details,
            company and outlet information, sales records, payment entries, and location updates.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom>How we use information</Typography>
          <Typography paragraph>
            We use this information to authenticate users, maintain business records, calculate
            balances and stock, provide reports, and support the services requested by your company.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom>Data sharing and security</Typography>
          <Typography paragraph>
            Access is limited to authorized users and roles in your organization. We do not sell
            business or personal information. We apply access controls and reasonable safeguards to
            protect stored information, while no online system can guarantee absolute security.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom>Retention and your choices</Typography>
          <Typography paragraph>
            Records are retained as needed for business operations and legal or accounting
            requirements. Contact your administrator to request access, correction, or removal of
            information where applicable.
          </Typography>

          <Typography variant="h5" component="h2" gutterBottom>Contact</Typography>
          <Typography paragraph>
            For privacy questions, contact EduNextG India LLP through your organization’s support
            contact or the official EduNextG website.
          </Typography>

          <Typography component={Link} to="/" color="primary" sx={{ fontWeight: 600 }}>
            Return to home
          </Typography>
        </Card>
      </Container>
    </Box>
  );
}

export default PrivacyPolicy;
