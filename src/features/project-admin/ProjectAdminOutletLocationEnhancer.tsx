import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { createOutletAdmin } from '../../services/audit-core/uc02Admin';
import { useSessionStore } from '../../store/sessionStore';

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type SaveState =
  | { kind: 'idle'; message: '' }
  | { kind: 'info' | 'success' | 'error'; message: string };

function findOutletForm(): HTMLFormElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLFormElement>('form.uc02-card')).find(
      (form) => form.querySelector('.uc02-card__title h3')?.textContent?.trim() === 'Add Dealer Outlet',
    ) ?? null
  );
}

function findFieldControl(form: HTMLFormElement, labelText: string): FieldControl | null {
  const field = Array.from(form.querySelectorAll<HTMLLabelElement>('label.uc02-field')).find(
    (label) => label.querySelector('span')?.textContent?.trim() === labelText,
  );
  return field?.querySelector<FieldControl>('input, textarea, select') ?? null;
}

function readField(form: HTMLFormElement, labelText: string) {
  return findFieldControl(form, labelText)?.value.trim() ?? '';
}

function addressFromForm(form: HTMLFormElement) {
  return ['Address', 'City', 'State / Region', 'Postal Code']
    .map((label) => readField(form, label))
    .filter(Boolean)
    .join(', ');
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'The outlet could not be saved. Please try again.';
}

function OutletLocationPanel({ host }: { host: HTMLElement }) {
  const tenantId = useSessionStore((state) => state.tenantId);
  const accessToken = useSessionStore((state) => state.accessToken);
  const form = host.closest('form');
  const [addressQuery, setAddressQuery] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle', message: '' });

  useEffect(() => {
    if (!(form instanceof HTMLFormElement)) return undefined;

    const controls = ['Address', 'City', 'State / Region', 'Postal Code']
      .map((label) => findFieldControl(form, label))
      .filter((control): control is FieldControl => control !== null);

    const refresh = () => {
      setAddressQuery(addressFromForm(form));
      setCoordinates(null);
      setSaveState({ kind: 'idle', message: '' });
    };

    setAddressQuery(addressFromForm(form));
    controls.forEach((control) => {
      control.addEventListener('input', refresh);
      control.addEventListener('change', refresh);
    });

    return () => {
      controls.forEach((control) => {
        control.removeEventListener('input', refresh);
        control.removeEventListener('change', refresh);
      });
    };
  }, [form]);

  useEffect(() => {
    if (!(form instanceof HTMLFormElement) || !coordinates) return undefined;

    const submitPinnedOutlet = async (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const dealerId = readField(form, 'Dealer');
      const outletName = readField(form, 'Outlet Name');
      const outletClassification = readField(form, 'Classification') as 'ONSITE' | 'SATELLITE';
      const monthlyVehicleVolume = readField(form, 'Monthly Vehicle Volume');

      if (!tenantId || !accessToken) {
        setSaveState({ kind: 'error', message: 'Your session is not ready. Please sign in again.' });
        return;
      }
      if (!dealerId || !outletName) {
        setSaveState({ kind: 'error', message: 'Dealer and Outlet Name are required.' });
        return;
      }

      setSaving(true);
      setSaveState({ kind: 'info', message: 'Saving outlet with pinned location…' });
      try {
        await createOutletAdmin(
          tenantId,
          dealerId,
          {
            outletName,
            outletClassification,
            addressText: readField(form, 'Address') || null,
            city: readField(form, 'City') || null,
            stateRegion: readField(form, 'State / Region') || null,
            postalCode: readField(form, 'Postal Code') || null,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            monthlyVehicleVolume: monthlyVehicleVolume ? Number(monthlyVehicleVolume) : null,
          },
          accessToken,
        );
        setSaveState({ kind: 'success', message: 'Outlet saved with its pinned location.' });
        window.setTimeout(() => window.location.reload(), 450);
      } catch (error) {
        setSaveState({ kind: 'error', message: errorText(error) });
        setSaving(false);
      }
    };

    form.addEventListener('submit', submitPinnedOutlet, true);
    return () => form.removeEventListener('submit', submitPinnedOutlet, true);
  }, [accessToken, coordinates, form, tenantId]);

  const mapQuery = useMemo(() => {
    if (coordinates) return `${coordinates.latitude},${coordinates.longitude}`;
    return addressQuery;
  }, [addressQuery, coordinates]);

  const mapSrc = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed`
    : '';
  const openMapsUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : '';

  const pinCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSaveState({ kind: 'error', message: 'Location services are not available on this device/browser.' });
      return;
    }

    setLocating(true);
    setSaveState({ kind: 'info', message: 'Getting the device location…' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setCoordinates(next);
        setLocating(false);
        setSaveState({
          kind: 'success',
          message: `Location pinned${Number.isFinite(next.accuracy) ? ` (accuracy ±${Math.round(next.accuracy!)} m)` : ''}.`,
        });
      },
      (error) => {
        setLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow location access or use the typed address pin.'
            : 'Current location could not be determined. Use the typed address pin or try again.';
        setSaveState({ kind: 'error', message });
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  };

  return (
    <section className="uc02-outlet-location" aria-label="Outlet map location">
      <div className="uc02-outlet-location__head">
        <div>
          <strong>Google Maps Location</strong>
          <span>Confirm the outlet on the map. Use device location for an exact GPS pin.</span>
        </div>
        <div className="uc02-outlet-location__actions">
          <button
            className="uc02-button"
            type="button"
            onClick={pinCurrentLocation}
            disabled={locating || saving}
          >
            {locating ? 'Locating…' : 'Pin current location'}
          </button>
          {openMapsUrl && (
            <a className="uc02-button uc02-outlet-location__maps-link" href={openMapsUrl} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
          )}
        </div>
      </div>

      {mapSrc ? (
        <div className="uc02-outlet-location__map-wrap">
          <iframe
            className="uc02-outlet-location__map"
            title="Dealer outlet location on Google Maps"
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <div className="uc02-outlet-location__pin-label">
            <span aria-hidden="true">●</span>
            {coordinates ? 'Exact device location pinned' : 'Address location pinned'}
          </div>
        </div>
      ) : (
        <div className="uc02-outlet-location__empty">
          Enter the outlet address above or choose <strong>Pin current location</strong> to show the map.
        </div>
      )}

      {coordinates && (
        <div className="uc02-outlet-location__coordinates">
          <span>Latitude <strong>{coordinates.latitude.toFixed(6)}</strong></span>
          <span>Longitude <strong>{coordinates.longitude.toFixed(6)}</strong></span>
        </div>
      )}

      {saveState.message && (
        <div className={`uc02-outlet-location__message uc02-outlet-location__message--${saveState.kind}`} role="status">
          {saveState.message}
        </div>
      )}
      {coordinates && (
        <small className="uc02-outlet-location__note">
          The pinned latitude and longitude will be saved with the outlet when you click Add Outlet.
        </small>
      )}
    </section>
  );
}

export default function ProjectAdminOutletLocationEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;

    const mount = () => {
      const form = findOutletForm();
      if (!form) {
        if (currentHost) currentHost.remove();
        currentHost = null;
        setHost(null);
        return;
      }

      if (currentHost?.isConnected && currentHost.closest('form') === form) return;
      currentHost?.remove();

      const addressControl = findFieldControl(form, 'Address');
      const addressField = addressControl?.closest('label.uc02-field');
      const nextHost = document.createElement('div');
      nextHost.className = 'uc02-outlet-location-host';
      if (addressField) addressField.insertAdjacentElement('afterend', nextHost);
      else form.appendChild(nextHost);
      currentHost = nextHost;
      setHost(nextHost);
    };

    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', mount);

    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', mount);
      currentHost?.remove();
    };
  }, []);

  return host ? createPortal(<OutletLocationPanel host={host} />, host) : null;
}
