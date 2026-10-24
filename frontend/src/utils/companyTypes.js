import { useEffect, useMemo, useState } from "react";

const API = process.env.REACT_APP_API_URL;

export const COMPANY_TYPES = [
  { value: "distributor", label: "Distributor" },
  { value: "cnf", label: "CNF" },
];

export const companyTypeLabel = (type) =>
  COMPANY_TYPES.find((t) => t.value === type)?.label || "";

// One shared request for the company list (with each company's type) per page load.
let companiesPromise = null;

const fetchCompanies = () => {
  if (!companiesPromise) {
    const token = localStorage.getItem("token");
    companiesPromise = fetch(`${API}/staff/companies`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => (Array.isArray(data) ? data : []))
      .catch(() => {
        companiesPromise = null;
        return [];
      });
  }
  return companiesPromise;
};

export const resetCompanyTypeCache = () => {
  companiesPromise = null;
};

const normalise = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Looks up a company's type (distributor / cnf) by id or by name.
 * `matches(company, type)` accepts an object with id/name, a plain id or a plain name.
 * With no type chosen, everything matches.
 */
export function useCompanyTypeLookup() {
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    let active = true;
    fetchCompanies().then((list) => {
      if (active) setCompanies(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    companies.forEach((c) => {
      if (c?.id != null) byId.set(String(c.id), c.type || "");
      if (c?.name) byName.set(normalise(c.name), c.type || "");
    });

    const typeOf = (company) => {
      if (company == null || company === "") return "";
      if (typeof company === "object") {
        if (company.type) return company.type;
        if (company.id != null && byId.has(String(company.id))) return byId.get(String(company.id));
        return byName.get(normalise(company.name || company.company_name)) || "";
      }
      const key = String(company);
      if (byId.has(key)) return byId.get(key);
      return byName.get(normalise(key)) || "";
    };

    const matches = (company, type) => !type || typeOf(company) === type;

    return { companies, typeOf, matches, loaded: companies.length > 0 };
  }, [companies]);
}
