import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Box, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import CompanyTypeSelect from "components/CompanyFilter/CompanyTypeSelect";
import { getSaleCompanyOptions } from "utils/companyFilter";
import { useCompanyTypeLookup } from "utils/companyTypes";

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
    <Box display="flex" gap={1} width="100%">
      <Box flex={1} minWidth={0}>
        <CompanyTypeSelect id={`${id}-type`} value={companyType} onChange={handleTypeChange} />
      </Box>
      <Box flex={1} minWidth={0}>
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
      </Box>
    </Box>
  );
}

CompanyFilter.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  id: PropTypes.string.isRequired,
};

export default CompanyFilter;
