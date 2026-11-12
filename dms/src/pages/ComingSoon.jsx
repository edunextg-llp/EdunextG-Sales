import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

// Placeholder used by every sidebar page until its new UI is built.
export default function ComingSoon({ title, icon: IconComponent }) {
  return (
    <Card>
      <CardContent sx={{ p: 5, textAlign: "center" }}>
        {IconComponent && (
          <Box sx={{ color: "primary.main", display: "flex", justifyContent: "center" }}>
            <IconComponent size={48} />
          </Box>
        )}
        <Typography variant="h5" fontWeight="bold" mt={1}>
          {title}
        </Typography>
        <Typography color="text.secondary" mt={1}>
          New page coming soon.
        </Typography>
      </CardContent>
    </Card>
  );
}
