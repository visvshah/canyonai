import { Box, Typography } from "@mui/material";

export default function ImportQuotesPage() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Import Quotes
      </Typography>
      <Typography variant="body1" color="text.secondary">
        This page will let you migrate existing documents, spreadsheets, and other
        sources to build a Canyon-specific quote knowledge base for your organization.
        Placeholder content for now.
      </Typography>
    </Box>
  );
}


