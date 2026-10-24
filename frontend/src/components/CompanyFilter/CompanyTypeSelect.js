import PropTypes from "prop-types";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import { COMPANY_TYPES } from "utils/companyTypes";

/**
 * Company Type dropdown (Distributor / CNF) shown before every Company dropdown.
 * `required` forms show "Select Company Type"; filters show "All Types".
 */
function CompanyTypeSelect({ id, value, onChange, required, disabled, height, sx }) {
  const label = required ? "Company Type *" : "Company Type";
  return (
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        id={id}
        value={value}
        label={label}
        onChange={(event) => onChange(event.target.value)}
        sx={{ minHeight: height, height, backgroundColor: "#fff", ...sx }}
      >
        <MenuItem value="">
          <em>{required ? "Select Company Type" : "All Types"}</em>
        </MenuItem>
        {COMPANY_TYPES.map((type) => (
          <MenuItem key={type.value} value={type.value}>
            {type.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

CompanyTypeSelect.defaultProps = {
  required: false,
  disabled: false,
  height: 44,
  sx: {},
};

CompanyTypeSelect.propTypes = {
  id: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  height: PropTypes.number,
  sx: PropTypes.object,
};

export default CompanyTypeSelect;
