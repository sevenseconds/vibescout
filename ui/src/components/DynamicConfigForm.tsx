import { AWS_REGIONS } from '../constants/regions';

interface ConfigField {
  name: string;
  type: 'text' | 'password' | 'select' | 'arn' | 'region';
  label: string;
  placeholder?: string;
  required: boolean;
  helperText?: string;
  options?: { label: string; value: string }[];
}

interface ConfigSchema {
  fields: ConfigField[];
}

interface DynamicConfigFormProps {
  schema: ConfigSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
}

export default function DynamicConfigForm({ schema, values, onChange }: DynamicConfigFormProps) {
  const handleChange = (fieldName: string, value: string) => {
    onChange({ ...values, [fieldName]: value });
  };

  const renderField = (field: ConfigField) => {
    const value = values[field.name] || '';

    switch (field.type) {
      case 'password':
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="password"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
            />
            {field.helperText && (
              <p className="text-xs text-muted-foreground">{field.helperText}</p>
            )}
          </div>
        );

      case 'select':
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
            >
              <option value="">Select...</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {field.helperText && (
              <p className="text-xs text-muted-foreground">{field.helperText}</p>
            )}
          </div>
        );

      case 'arn':
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className={`w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none font-mono text-sm transition-all text-foreground ${
                value && !value.startsWith('arn:') ? 'border-red-500' : 'focus:border-primary'
              }`}
            />
            {field.helperText && (
              <p className="text-xs text-muted-foreground">{field.helperText}</p>
            )}
            {value && !value.startsWith('arn:') && (
              <p className="text-xs text-red-500">⚠️ ARN must start with "arn:"</p>
            )}
          </div>
        );

      case 'region':
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
            >
              <option value="">Select region...</option>
              {AWS_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            {field.helperText && (
              <p className="text-xs text-muted-foreground">{field.helperText}</p>
            )}
          </div>
        );

      case 'text':
      default:
        return (
          <div key={field.name} className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 focus:outline-none focus:border-primary font-mono text-sm transition-all text-foreground"
            />
            {field.helperText && (
              <p className="text-xs text-muted-foreground">{field.helperText}</p>
            )}
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {schema.fields.map(renderField)}
    </div>
  );
}
