import Link from "next/link";
import { auth } from "~/server/auth";
import { Box, Typography, Button, Stack } from "@mui/material";

export default async function Landing() {
  const session = await auth();
  const href = session ? "/quotes" : "/api/auth/signin?callbackUrl=/quotes";
  return (
    <Box
      minHeight="100vh"
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      className="gradient-bg"
      sx={{ color: "white", textAlign: "center", px: 0 }}
    >
      <Typography
        variant="h3"
        component="h1"
        maxWidth={700}
        mb={3}
        fontWeight={600}
        className="fade-up"
      >
        Effortless quoting & approvals.
      </Typography>
      <Stack spacing={2} alignItems="center" className="fade-up" sx={{ animationDelay: '0.3s' }}>
      <Button
        component={Link}
        href={href}
        variant="contained"
        sx={{
          bgcolor: "white",
          color: "#091625",
          fontWeight: 600,
          px: 4,
          py: 1.5,
          "&:hover": { bgcolor: "#f5f5f5" },
        }}
      >
        Get started
      </Button>
      <Typography variant="subtitle2" maxWidth={450}>
        Automate approvals, eliminate errors, close deals faster.
      </Typography>
    </Stack>
    
      
    </Box>
  );
}
