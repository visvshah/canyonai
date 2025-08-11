"use client";

import React from "react";
import { CssBaseline, ThemeProvider, createTheme, responsiveFontSizes } from "@mui/material";

type Props = { children: React.ReactNode };

const AppThemeProvider = ({ children }: Props) => {
  let theme = createTheme({
    palette: {
      mode: "dark",
      primary: { main: "#4FC3F7" },
      secondary: { main: "#90CAF9" },
      background: {
        default: "#0A0F1A",
        paper: "#0F1726",
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: `var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial` as any,
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiChip: {
        defaultProps: { size: "small" },
      },
      MuiTextField: {
        defaultProps: { variant: "outlined" },
      },
    },
  });
  theme = responsiveFontSizes(theme);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default AppThemeProvider;

