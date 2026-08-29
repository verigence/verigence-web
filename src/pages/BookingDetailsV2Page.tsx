import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import PageHeader from '../components/PageHeader';
import {
  getBookingDetails,
  getBookingDetailsOptions,
  saveBookingDetails,
  type BookingDetailsPayload,
  type BookingReferenceOption,
} from '../services/audit-core/uc03BookingJourney';
import { submitPcBookingCapture } from '../services/audit-core/uc03PcVerification';
import { getBookingCaptureV2, type BookingCaptureV2 } from '../services/audit-core/uc03DocumentCaptureV2';
import { useProjectContextStore } from '../store/projectContextStore';
import { useSessionStore } from '../store/sessionStore';
import '../styles/uc03-document-capture-v2.css';

type DetailsForm = {
  customerType: string;
  dealType: string;
  dealSource: string;
  leadSource: string;
  registrationState: string;
  territoryCategorization: string;
  districtName: string;
  registrationType: string;
  registrationCategory: string;
  outrightPurchase: boolean | null;
};

const EMPTY_FORM: DetailsForm = {
  customerType: '',
  dealType: '',
  dealSource: '',
  leadSource: '',
  registrationState: '',
  territoryCategorization: '',
  districtName: '',
  registrationType: '',
  registrationCategory: '',
  outrightPurchase: null,
};

function MasterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: BookingReferenceOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="uc03-booking-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {label}</option>
        {options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
    </label>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="uc03-booking-choice">
      <legend>{label}</legend>
      <label><input type="radio" checked={value === true} onChange={() => onChange(true)} /> Yes</label>
      <label><input type="radio" checked={value === false} onChange={() => onChange(false)} /> No</label>
    </fieldset>
  );
}

function declaration(capture: BookingCaptureV2, key: string) {
  return capture.declarations.find((item) => item.conditionKey === key);
}

export default function BookingDetailsV2Page() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const navigate = useNavigate();
  const project = useProjectContextStore((state) => state.selectedProject);
  const accessToken = useSessionStore((state) => state.accessToken);
  const [form, setForm] = useState<DetailsForm>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const enabled = Boolean(project?.tenantId && journeyId && accessToken);
  const captureQuery = useQuery({
    queryKey: ['uc03-document-capture-v2', project?.tenantId, journeyId],
    queryFn: () => getBookingCaptureV2(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });
  const detailsQuery = useQuery({
    queryKey: ['uc03-booking-details', project?.tenantId, journeyId],
    queryFn: () => getBookingDetails(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });
  const optionsQuery = useQuery({
    queryKey: ['uc03-booking-details-options', project?.tenantId, journeyId],
    queryFn: () => getBookingDetailsOptions(project!.tenantId, journeyId!, accessToken),
    enabled,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!detailsQuery.data || dirty) return;
    setForm({
      customerType: detailsQuery.data.customerType || '',
      dealType: detailsQuery.data.dealType || '',
      dealSource: detailsQuery.data.dealSource || '',
      leadSource: detailsQuery.data.leadSource || '',
      registrationState: detailsQuery.data.registrationState || '',
      territoryCategorization: detailsQuery.data.territoryCategorization || '',
      districtName: detailsQuery.data.districtName || '',
      registrationType: detailsQuery.data.registrationType || '',
      registrationCategory: detailsQuery.data.registrationCategory || '',
      outrightPurchase: detailsQuery.data.outrightPurchase ?? null,
    });
  }, [detailsQuery.data, dirty]);

  const complete = useMemo(() => Boolean(
    form.customerType
      && form.dealType
      && form.dealSource
      && form.leadSource
      && form.registrationState
      && form.territoryCategorization
      && form.districtName
      && form.registrationType
      && form.registrationCategory
      && form.outrightPurchase !== null
  ), [form]);

  if (!project || !journeyId) return null;

  if (captureQuery.isPending || detailsQuery.isPending || optionsQuery.isPending) {
    return <div className="uc03-c1-loading" role="status">Loading Booking Details…</div>;
  }

  if (captureQuery.isError || detailsQuery.isError || optionsQuery.isError
      || !captureQuery.data || !detailsQuery.data || !optionsQuery.data) {
    const cause = captureQuery.error || detailsQuery.error || optionsQuery.error;
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>We couldn't open Booking Details.</strong>
          <p>{cause instanceof Error ? cause.message : 'Please try again.'}</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => navigate(`/v2/bookings/${journeyId}`)}>Back to Documents</button>
      </section>
    );
  }

  const capture = captureQuery.data;
  const details = detailsQuery.data;
  const options = optionsQuery.data;

  if (!capture.canContinue) {
    return (
      <section className="dashboard-load-state" role="alert">
        <div className="dashboard-load-state__mark">!</div>
        <div className="dashboard-load-state__copy">
          <strong>Document capture is not complete yet.</strong>
          <p>Required classifications or applicability declarations are still pending.</p>
        </div>
        <button type="button" className="user-menu-button" onClick={() => navigate(`/v2/bookings/${journeyId}`)}>Return to Documents</button>
      </section>
    );
  }

  const update = <K extends keyof DetailsForm>(key: K, value: DetailsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setError(undefined);
  };

  const conditions = {
    exchangeTaken: declaration(capture, 'exchangeTaken'),
    gstApplicable: declaration(capture, 'gstApplicable'),
    corporateCustomer: declaration(capture, 'corporateCustomer'),
  };
  const customerTypeIsCorporate = form.customerType.trim().toUpperCase() === 'CORPORATE';
  const corporateDeclared = conditions.corporateCustomer?.applicable === true;
  const corporateMismatch = Boolean(form.customerType) && customerTypeIsCorporate !== corporateDeclared;

  const payload = (): BookingDetailsPayload => {
    if (!complete || form.outrightPurchase === null) throw new Error('Complete all mandatory Booking Details.');
    if (corporateMismatch) {
      throw new Error('Customer Type and the Corporate applicability answer from Documents must match. Return to Documents or choose the matching Customer Type.');
    }
    return {
      priceListId: details.priceListId,
      customerType: form.customerType,
      dealType: form.dealType,
      dealSource: form.dealSource,
      leadSource: form.leadSource,
      registrationState: form.registrationState,
      territoryCategorization: form.territoryCategorization,
      districtName: form.districtName,
      registrationType: form.registrationType,
      registrationCategory: form.registrationCategory,
      outrightPurchase: form.outrightPurchase,
      tradeIn: conditions.exchangeTaken?.applicable ?? false,
      gstBenefit: conditions.gstApplicable?.applicable ?? false,
      corporateIdAvailable: customerTypeIsCorporate
        ? (conditions.corporateCustomer?.documentAvailable ?? false)
        : null,
    };
  };

  const pcCaptureValues = (): Record<string, unknown> => ({
    CUSTOMER_TYPE: form.customerType,
    DEAL_TYPE: form.dealType,
    DEAL_SOURCE: form.dealSource,
    LEAD_SOURCE: form.leadSource,
    REGISTRATION_STATE: form.registrationState,
    TERRITORY_CATEGORIZATION: form.territoryCategorization,
    DISTRICT_NAME: form.districtName,
    REGISTRATION_TYPE: form.registrationType,
    REGISTRATION_CATEGORY: form.registrationCategory,
    OUTRIGHT_PURCHASE: form.outrightPurchase,
    EXCHANGE_TAKEN: conditions.exchangeTaken?.applicable ?? false,
    GST_APPLICABLE: conditions.gstApplicable?.applicable ?? false,
    CORPORATE_CUSTOMER: conditions.corporateCustomer?.applicable ?? false,
  });

  const submit = async () => {
    setBusy(true); setError(undefined);
    try {
      const saved = await saveBookingDetails(
        project.tenantId,
        journeyId,
        payload(),
        details.aggregateVersion,
        accessToken,
      );
      await submitPcBookingCapture(
        project.tenantId,
        journeyId,
        saved.aggregateVersion,
        pcCaptureValues(),
        accessToken,
      );
      navigate(`/v2/bookings/${journeyId}/review`, { replace: true });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Booking could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-stack uc03-booking-journey uc03-v2-capture">
      <div className="uc03-c1-topbar">
        <button type="button" className="uc03-c1-back" onClick={() => navigate(`/v2/bookings/${journeyId}`)}>← Documents</button>
        <span>Project · {project.projectName}</span>
      </div>

      <PageHeader
        eyebrow="Capture New Booking · V2"
        title="Booking Details"
        description="Step 2 of 2 · Capture operational Booking details. GST, Corporate and Trade-In applicability were already captured on the Documents screen."
      />

      <nav className="uc03-booking-steps" aria-label="Booking capture steps">
        <button type="button" onClick={() => navigate(`/v2/bookings/${journeyId}`)}>1 <span>Documents</span></button>
        <button type="button" className="is-active" disabled>2 <span>Booking Details</span></button>
      </nav>

      {error ? <div className="uc03-booking-journey-feedback is-error" role="alert">{error}</div> : null}

      <section className="uc03-booking-step-panel">
        <header className="uc03-booking-step-heading">
          <div><span className="uc03-c1-eyebrow">Step 2</span><h2>Booking Details</h2></div>
          <span>Document extraction continues asynchronously</span>
        </header>

        <div className="uc03-v2-carried-forward">
          <strong>Carried forward from Documents</strong>
          <span>Trade-In: {conditions.exchangeTaken?.applicable ? 'Yes' : 'No'}</span>
          <span>GST applicable: {conditions.gstApplicable?.applicable ? 'Yes' : 'No'}</span>
          <span>Corporate customer: {conditions.corporateCustomer?.applicable ? 'Yes' : 'No'}</span>
        </div>

        {corporateMismatch ? (
          <div className="uc03-booking-journey-feedback is-error" role="alert">
            Customer Type and the Corporate answer captured on Documents do not match. Correct one of them before submitting.
          </div>
        ) : null}

        <div className="uc03-booking-details-grid">
          <MasterSelect label="Customer Type" value={form.customerType} options={options.customerTypes} onChange={(value) => update('customerType', value)} />
          <MasterSelect label="Deal Type" value={form.dealType} options={options.dealTypes} onChange={(value) => update('dealType', value)} />
          <MasterSelect label="Deal Source" value={form.dealSource} options={options.dealSources} onChange={(value) => update('dealSource', value)} />
          <MasterSelect label="Lead Source" value={form.leadSource} options={options.leadSources} onChange={(value) => update('leadSource', value)} />
          <MasterSelect label="Registration State" value={form.registrationState} options={options.registrationStates} onChange={(value) => update('registrationState', value)} />
          <MasterSelect label="Territory Categorization" value={form.territoryCategorization} options={options.territoryCategories} onChange={(value) => update('territoryCategorization', value)} />
          <MasterSelect label="District" value={form.districtName} options={options.districts} onChange={(value) => update('districtName', value)} />
          <MasterSelect label="Registration Type" value={form.registrationType} options={options.registrationTypes} onChange={(value) => update('registrationType', value)} />
          <MasterSelect label="Registration Category" value={form.registrationCategory} options={options.registrationCategories} onChange={(value) => update('registrationCategory', value)} />
          <YesNo label="Outright Purchase" value={form.outrightPurchase} onChange={(value) => update('outrightPurchase', value)} />
        </div>

        <div className="uc03-booking-step-footer">
          <span>Submitting completes PC Booking capture and opens Review. Extraction does not need to finish first.</span>
          <button type="button" className="uc03-c1-primary" disabled={!complete || corporateMismatch || busy} onClick={() => void submit()}>
            {busy ? 'Submitting…' : 'Submit Booking → Review'}
          </button>
        </div>
      </section>
    </div>
  );
}
