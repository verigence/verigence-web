type Step = {
  key: number;
  short: string;
  label: string;
  description: string;
};

export const projectAdminSteps: Step[] = [
  { key: 1, short: 'Step 1', label: 'Project Details', description: 'Create or update Project details.' },
  { key: 2, short: 'Step 2', label: 'Dealers', description: 'Add and manage Project dealers.' },
  { key: 3, short: 'Step 3', label: 'Dealer Outlets', description: 'Add and manage dealer outlet locations.' },
  { key: 4, short: 'Step 4', label: 'Employees', description: 'Find people who can be assigned to the Project.' },
  { key: 5, short: 'Step 5', label: 'Role Mapping', description: 'Assign roles and working scope.' },
  { key: 6, short: 'Step 6', label: 'Project Masters', description: 'Upload and manage Project masters.' },
  { key: 7, short: 'Step 7', label: 'Readiness', description: 'Review anything that must be completed before activation.' },
  { key: 8, short: 'Step 8', label: 'Activate Project', description: 'Review and activate the Project.' },
];

export default function ProjectAdminStepper({
  activeStep,
  onChange,
  projectConfigured,
}: {
  activeStep: number;
  onChange: (step: number) => void;
  projectConfigured: boolean;
}) {
  return (
    <nav className="uc02-stepper" aria-label="Project administration steps">
      {projectAdminSteps.map((step) => {
        const disabled = step.key > 1 && !projectConfigured;
        return (
          <button
            key={step.key}
            type="button"
            className={`uc02-stepper__item${activeStep === step.key ? ' uc02-stepper__item--active' : ''}`}
            onClick={() => onChange(step.key)}
            disabled={disabled}
            title={disabled ? 'Create or select a Project first.' : step.description}
          >
            <span className="uc02-stepper__number">{step.key}</span>
            <span className="uc02-stepper__copy">
              <small>{step.short}</small>
              <strong>{step.label}</strong>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
