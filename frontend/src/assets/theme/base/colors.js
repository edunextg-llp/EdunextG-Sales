/**
=========================================================
* Material Dashboard 2 React - v2.2.0
=========================================================

* Product Page: https://www.creative-tim.com/product/material-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)

Coded by www.creative-tim.com

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

/**
 * The base colors for the Material Dashboard 2 React.
 * You can add new color using this file.
 * You can customized the colors for the entire Material Dashboard 2 React using thie file.
 */

// DMS look (same as dms/src/index.css "dms" theme): royal blue on white, pale-blue page,
// navy sidebar, flat (no gradients: each gradient's two stops are the same colour).
const colors = {
  background: {
    default: "#f5f8fd",
  },

  text: {
    main: "#5b6b85",
    focus: "#5b6b85",
  },

  transparent: {
    main: "transparent",
  },

  white: {
    main: "#ffffff",
    focus: "#ffffff",
  },

  black: {
    light: "#0f1d33",
    main: "#000000",
    focus: "#000000",
  },

  primary: {
    main: "#1d4ed8",
    focus: "#1e40af",
  },

  secondary: {
    main: "#64748b",
    focus: "#475569",
  },

  info: {
    main: "#1d4ed8",
    focus: "#1e40af",
  },

  success: {
    main: "#15803d",
    focus: "#166534",
  },

  warning: {
    main: "#d97706",
    focus: "#b45309",
  },

  error: {
    main: "#dc2626",
    focus: "#b91c1c",
  },

  light: {
    main: "#f5f8fd",
    focus: "#eef3fa",
  },

  dark: {
    main: "#0f1d33",
    focus: "#0f2a5a",
  },

  grey: {
    100: "#f5f8fd",
    200: "#eef3fa",
    300: "#dfe6f2",
    400: "#cdd7e6",
    500: "#9aa8bf",
    600: "#5b6b85",
    700: "#3b4a63",
    800: "#1f2d45",
    900: "#0f1d33",
  },

  gradients: {
    primary: {
      main: "#1d4ed8",
      state: "#1d4ed8",
    },

    secondary: {
      main: "#64748b",
      state: "#64748b",
    },

    info: {
      main: "#1d4ed8",
      state: "#1d4ed8",
    },

    success: {
      main: "#15803d",
      state: "#15803d",
    },

    warning: {
      main: "#d97706",
      state: "#d97706",
    },

    error: {
      main: "#dc2626",
      state: "#dc2626",
    },

    light: {
      main: "#eef3fa",
      state: "#eef3fa",
    },

    // Sidebar and dark headers: the DMS navy.
    dark: {
      main: "#0f2a5a",
      state: "#0f2a5a",
    },
  },

  socialMediaColors: {
    facebook: {
      main: "#3b5998",
      dark: "#344e86",
    },

    twitter: {
      main: "#55acee",
      dark: "#3ea1ec",
    },

    instagram: {
      main: "#125688",
      dark: "#0e456d",
    },

    linkedin: {
      main: "#0077b5",
      dark: "#00669c",
    },

    pinterest: {
      main: "#cc2127",
      dark: "#b21d22",
    },

    youtube: {
      main: "#e52d27",
      dark: "#d41f1a",
    },

    vimeo: {
      main: "#1ab7ea",
      dark: "#13a3d2",
    },

    slack: {
      main: "#3aaf85",
      dark: "#329874",
    },

    dribbble: {
      main: "#ea4c89",
      dark: "#e73177",
    },

    github: {
      main: "#24292e",
      dark: "#171a1d",
    },

    reddit: {
      main: "#ff4500",
      dark: "#e03d00",
    },

    tumblr: {
      main: "#35465c",
      dark: "#2a3749",
    },
  },

  badgeColors: {
    primary: {
      background: "#dbe6fd",
      text: "#1d4ed8",
    },

    secondary: {
      background: "#e5eaf2",
      text: "#475569",
    },

    info: {
      background: "#dbe6fd",
      text: "#1d4ed8",
    },

    success: {
      background: "#dcf3e3",
      text: "#15803d",
    },

    warning: {
      background: "#fdecd2",
      text: "#b45309",
    },

    error: {
      background: "#fde0e0",
      text: "#dc2626",
    },

    light: {
      background: "#ffffff",
      text: "#9aa8bf",
    },

    dark: {
      background: "#dfe6f2",
      text: "#0f2a5a",
    },
  },

  coloredShadows: {
    primary: "#1d4ed8",
    secondary: "#64748b",
    info: "#1d4ed8",
    success: "#15803d",
    warning: "#d97706",
    error: "#dc2626",
    light: "#cdd7e6",
    dark: "#0f2a5a",
  },

  // Field borders: light blue-grey, blue when focused (as in the DMS).
  inputBorderColor: "#cdd7e6",

  tabs: {
    indicator: { boxShadow: "#ddd" },
  },
};

export default colors;
