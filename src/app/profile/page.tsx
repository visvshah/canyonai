import { Box, Typography } from "@mui/material";

export default function ProfilePage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Organization Profile
      </Typography>
      <Typography variant="body1" color="text.secondary">
        This page will be the home for onboarding your organization, configuring the
        packages and products your org uses, and managing org-specific roles and
        permissions. Placeholder content for now.
      </Typography>
    </Box>
  );
}


