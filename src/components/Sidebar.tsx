"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
  Typography,
} from "@mui/material";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import InsightsIcon from "@mui/icons-material/Insights";
import HomeIcon from "@mui/icons-material/Home";
import { usePathname } from "next/navigation";
import BusinessIcon from "@mui/icons-material/Business";

const NAV_ITEMS = [
  { name: "Home", href: "/home", icon: HomeIcon },
  { name: "Quotes", href: "/quotes", icon: ListAltIcon },
  { name: "Create Quote", href: "/create-quote", icon: AddCircleOutlineIcon },
  { name: "Insights", href: "/insights", icon: InsightsIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  // Hide sidebar on landing page
  if (pathname === "/") {
    return null;
  }
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  const drawerWidth = 200;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: "border-box",
          bgcolor: "#091625",
          color: "white",
          borderRight: "none",
        },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Toolbar sx={{ gap: 1 }}>
          <Image src="/canyonlogo.png" alt="Canyon" width={96} height={96} />
        </Toolbar>

        <List disablePadding sx={{ flexGrow: 1 }}>
          {NAV_ITEMS.map(({ name, href, icon: Icon }) => (
            <ListItem key={href} disablePadding>
              <ListItemButton
                component={Link}
                href={href}
                selected={isActive(href)}
                sx={{
                  width: "100%",
                  borderRadius: 0,
                  "&.Mui-selected": {
                    bgcolor: "#0C2339",
                    "&:hover": { bgcolor: "#112B46" },
                  },
                }}
              >
                <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>

        <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <List disablePadding>
            <ListItem disablePadding>
              <ListItemButton
                component={Link}
                href="/profile"
                selected={isActive("/profile")}
                sx={{
                  width: "100%",
                  borderRadius: 0,
                  "&.Mui-selected": {
                    bgcolor: "#0C2339",
                    "&:hover": { bgcolor: "#112B46" },
                  },
                }}
              >
                <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>
                  <BusinessIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary="Organization" />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Box>
    </Drawer>
  );
}
