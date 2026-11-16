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
 * The base box-shadow styles for the Material Dashboard 2 React.
 * You can add new box-shadow using this file.
 * You can customized the box-shadow for the entire Material Dashboard 2 React using thie file.
 */

// Material Dashboard 2 React Base Styles
import colors from "assets/theme/base/colors";

// Material Dashboard 2 React Helper Functions
import boxShadow from "assets/theme/functions/boxShadow";

const { tabs, coloredShadows } = colors;

// DMS look is flat: hairline shadows only (cards get a border instead), no coloured glow.
const ink = "#0f1d33";
const coloredShadow = (color) => `${boxShadow([0, 1], [2, 0], ink, 0.06)}, ${boxShadow([0, 1], [3, 0], color, 0.18)}`;

const boxShadows = {
  xs: boxShadow([0, 1], [2, 0], ink, 0.05),
  sm: boxShadow([0, 1], [2, 0], ink, 0.06),
  md: boxShadow([0, 1], [3, 0], ink, 0.07),
  lg: boxShadow([0, 2], [6, 0], ink, 0.08),
  xl: boxShadow([0, 6], [16, -2], ink, 0.12),
  xxl: boxShadow([0, 10], [24, -4], ink, 0.12),
  inset: boxShadow([0, 1], [2, 0], ink, 0.05, "inset"),
  colored: {
    primary: coloredShadow(coloredShadows.primary),
    secondary: coloredShadow(coloredShadows.secondary),
    info: coloredShadow(coloredShadows.info),
    success: coloredShadow(coloredShadows.success),
    warning: coloredShadow(coloredShadows.warning),
    error: coloredShadow(coloredShadows.error),
    light: coloredShadow(coloredShadows.light),
    dark: coloredShadow(coloredShadows.dark),
  },

  navbarBoxShadow: boxShadow([0, 1], [0, 0], "#dfe6f2", 1),
  sliderBoxShadow: {
    thumb: boxShadow([0, 1], [4, 0], ink, 0.2),
  },
  tabsBoxShadow: {
    indicator: boxShadow([0, 1], [5, 1], tabs.indicator.boxShadow, 1),
  },
};

export default boxShadows;
