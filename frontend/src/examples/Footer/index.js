// Fixed to the bottom of the screen like the top header (it starts after the sidebar on desktop).
// DashboardLayout draws it once for every page and leaves room for it; pages still render
// <Footer />, which is now a no-op so there is never a second copy.
import { Link } from "react-router-dom";
import { useMaterialUIController } from "context";
import { SIDEBAR_MINI_WIDTH, SIDEBAR_WIDTH } from "examples/Sidenav";

export function SiteFooter() {
  const [controller] = useMaterialUIController();
  const { miniSidenav } = controller;
  return (
    <>
      {/* Takes the footer's place in the page, so the last content is not hidden behind it. */}
      <div aria-hidden="true" className="h-20 shrink-0 sm:h-[52px]" />
      <footer
        style={{ "--sidebar-w": `${miniSidenav ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH}px` }}
        className="fixed inset-x-0 bottom-0 z-[1100] grid min-h-11 items-center gap-0.5 border-t border-slate-200 bg-white/95 px-4 py-1.5 text-center font-[Poppins,Roboto,sans-serif] text-[12.5px] text-slate-500 backdrop-blur-md transition-[left] duration-200 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-6 xl:left-[var(--sidebar-w)]"
      >
        <span className="sm:text-left">© {new Date().getFullYear()} Bawarchee Food Packaging Pvt. Ltd.</span>
        <span>
          Maintained by{" "}
          <a href="https://edunextg.in" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 no-underline hover:text-blue-700 hover:underline">
            EduNextG India LLP
          </a>
        </span>
        <Link to="/privacy-policy" className="font-semibold text-slate-700 no-underline hover:text-blue-700 hover:underline sm:justify-self-end">
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
