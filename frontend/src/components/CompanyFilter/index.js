import { useMemo } from "react";
import PropTypes from "prop-types";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import { getSaleCompanyOptions } from "utils/companyFilter";

function CompanyFilter({ rows, value, onChange, id }) {
  const options = useMemo(() => getSaleCompanyOptions(rows), [rows]);
  return (
    <FormControl size="small" fullWidth>
      <InputLabel id={`${id}-label`}>Company</InputLabel>
      <Select
        labelId={`${id}-label`}
        id={id}
        label="Company"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        sx={{ height: 44, backgroundColor: "#fff" }}
      >
        <MenuItem value="">All Companies</MenuItem>
        {value && !options.some((option) => option.id === value) && (
          <MenuItem value={value}>{`Company ${value}`}</MenuItem>
        )}
        {options.map((company) => (
          <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

CompanyFilter.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  id: PropTypes.string.isRequired,
};

export default CompanyFilter;
