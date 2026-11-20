// Welcome (signed in, no pages given yet): Tailwind CSS (no MUI).
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import { useAuth } from "context/AuthContext";
import { Icon } from "components/tw";

function Welcome() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="flex justify-center pt-10 font-[Poppins,Roboto,sans-serif]">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-8 py-12 text-center shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
          <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Icon name="waving_hand" className="text-[32px]" />
          </span>
          <h2 className="m-0 text-[26px] font-bold text-slate-900">Welcome back, {user?.username || "Staff"}!</h2>
          <p className="m-0 mt-2 text-[14px] text-slate-600">Your login was successful.</p>
          <p className="m-0 mx-auto mt-4 flex max-w-sm items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-[13px] text-amber-900">
            <Icon name="info" className="text-[18px] text-amber-600" />
            No page permissions have been assigned yet. Please contact the administrator.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Welcome;
