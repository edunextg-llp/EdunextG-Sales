// Company type + company filter for sales lists (Delivery Manager pages): Tailwind CSS (no MUI).
import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { getSaleCompanyOptions } from "utils/companyFilter";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import { Field, fieldClass } from "components/tw";

function CompanyFilter({ rows, value, onChange, id }) {
  const [companyType, setCompanyType] = useState("");
  const { matches } = useCompanyTypeLookup();
  const allOptions = useMemo(() => getSaleCompanyOptions(rows), [rows]);
  const options = useMemo(
    () => allOptions.filter((option) => matches(option, companyType)),
    [allOptions, companyType, matches]
  );

  const handleTypeChange = (type) => {
    setCompanyType(type);
    if (value && type && !matches(value, type)) onChange("");
  };

  return (
    <div className="flex w-full gap-2">
      <Field label="Company type" width="min-w-0 flex-1">
        <select id={`${id}-type`} className={fieldClass} value={companyType} onChange={(event) => handleTypeChange(event.target.value)}>
          <option value="">All types</option>
          {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </Field>
      <Field label="Company" width="min-w-0 flex-1">
        <select id={id} className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">All companies</option>
          {value && !options.some((option) => option.id === value) && <option value={value}>{`Company ${value}`}</option>}
          {options.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </Field>
    </div>
  );
}

CompanyFilter.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  id: PropTypes.string.isRequired,
};

export default CompanyFilter;
