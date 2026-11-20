// Site footer: "© year EduNextG India LLP" on the left, "Privacy Policy" on the right. Tailwind CSS (no MUI).
// Fixed to the bottom of the screen like the top header (it starts after the sidebar on desktop).
// DashboardLayout draws it once for every page and leaves room for it; pages still render
// <Footer />, which is now a no-op so there is never a second copy.
import { Link } from "react-router-dom";
import { useMaterialUIController } from "context";
import { SIDEBAR_MINI_WIDTH, SIDEBAR_WIDTH } from "examples/Sidenav";

export const FOOTER_HEIGHT = 44;

export function SiteFooter() {
  const [controller] = useMaterialUIController();
  const { miniSidenav } = controller;
  return (
    <>
      {/* Takes the footer's place in the page, so the last content is not hidden behind it. */}
      <div aria-hidden="true" className="shrink-0" style={{ height: FOOTER_HEIGHT + 8 }} />
      <footer
        style={{ "--sidebar-w": `${miniSidenav ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH}px`, height: FOOTER_HEIGHT }}
        className="fixed inset-x-0 bottom-0 z-[1100] flex items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-4 font-[Poppins,Roboto,sans-serif] text-[12.5px] text-slate-500 backdrop-blur-md transition-[left] duration-200 sm:px-6 xl:left-[var(--sidebar-w)]"
      >
        <span className="truncate">© {new Date().getFullYear()} EduNextG India LLP</span>
        <Link to="/privacy-policy" className="shrink-0 font-semibold text-slate-700 no-underline hover:text-blue-700 hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </>
  );
}

function Footer() {
  return null;
}

export default Footer;
