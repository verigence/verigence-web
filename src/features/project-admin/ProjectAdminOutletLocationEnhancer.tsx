import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type MessageState =
  | { kind: 'idle'; message: '' }
  | { kind: 'info' | 'success' | 'error'; message: string };

type OutletLocationMount = {
  host: HTMLElement;
  form: HTMLFormElement;
};

function findOutletForm(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>('form[data-uc02-outlet-editor="true"]');
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

function hiddenInput(form: HTMLFormElement, name: string) {
  let input = form.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    form.appendChild(input);
  }
  return input;
}

function readInitialCoordinates(form: HTMLFormElement): Coordinates | null {
  const latitude = Number(hiddenInput(form, 'latitude').value);
  const longitude = Number(hiddenInput(form, 'longitude').value);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)
    ? { latitude, longitude }
    : null;
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'The outlet location could not be resolved. Please try again.';
}

function OutletLocationPanel({ form }: { form: HTMLFormElement }) {
  const [addressQuery, setAddressQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() => readInitialCoordinates(form));
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<MessageState>({ kind: 'idle', message: '' });

  useEffect(() => {
    const controls = ['Address', 'City', 'State / Region', 'Postal Code']
      .map((label) => findFieldControl(form, label))
      .filter((control): control is FieldControl => control !== null);

    const refresh = () => {
      const nextAddress = addressFromForm(form);
      setAddressQuery(nextAddress);
      setSearchText((current) => current.trim() ? current : nextAddress);
      setSearchQuery('');
    };

    const initialAddress = addressFromForm(form);
    setAddressQuery(initialAddress);
    setSearchText((current) => current || initialAddress);
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
    hiddenInput(form, 'latitude').value = coordinates ? String(coordinates.latitude) : '';
    hiddenInput(form, 'longitude').value = coordinates ? String(coordinates.longitude) : '';
  }, [coordinates, form]);

  const mapQuery = useMemo(() => {
    if (coordinates) return `${coordinates.latitude},${coordinates.longitude}`;
    if (searchQuery) return searchQuery;
    return addressQuery;
  }, [addressQuery, coordinates, searchQuery]);

  const mapSrc = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed`
    : '';
  const openMapsUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : '';

  const pinSearchLocation = () => {
    const query = searchText.trim();
    if (!query) {
      setMessage({ kind: 'error', message: 'Enter a place, landmark, road, locality or PIN code to search.' });
      return;
    }
    setSearchQuery(query);
    setMessage({ kind: 'success', message: 'Google Maps search location loaded for visual confirmation.' });
  };

  const applyCoordinates = (next: Coordinates) => {
    setCoordinates(next);
    setSearchQuery('');
    setLocating(false);
    setMessage({
      kind: 'success',
      message: `Exact device location pinned${Number.isFinite(next.accuracy) ? ` (accuracy ±${Math.round(next.accuracy ?? 0)} m)` : ''}.`,
    });
  };

  const pinCurrentLocation = async () => {
    setLocating(true);
    setMessage({ kind: 'info', message: 'Getting the device location…' });
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          throw new Error('Location permission was denied. Allow location access or use text search.');
        }
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 30_000,
        });
        applyCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        return;
      }
      if (!navigator.geolocation) throw new Error('Location services are not available in this browser.');
      navigator.geolocation.getCurrentPosition(
        (position) => applyCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
        (error) => {
          setLocating(false);
          setMessage({
            kind: 'error',
            message: error.code === error.PERMISSION_DENIED
              ? 'Location permission was denied. Allow location access or use text search.'
              : 'Current location could not be determined. Use text search or try again.',
          });
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    } catch (error) {
      setLocating(false);
      setMessage({ kind: 'error', message: errorText(error) });
    }
  };

  return (
    <section className="uc02-outlet-location" aria-label="Outlet map location">
      <div className="uc02-outlet-location__head">
        <div>
          <strong>Google Maps Location</strong>
          <span>Search by place or landmark, use the entered address, or pin the device GPS location.</span>
        </div>
        <div className="uc02-outlet-location__actions">
          <button className="uc02-button" type="button" onClick={() => void pinCurrentLocation()} disabled={locating}>
            {locating ? 'Locating…' : 'Pin current location'}
          </button>
          {openMapsUrl && <a className="uc02-button uc02-outlet-location__maps-link" href={openMapsUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>}
        </div>
      </div>

      <div className="uc02-outlet-location__search" role="search" aria-label="Search Google Maps location">
        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              pinSearchLocation();
            }
          }}
          placeholder="Search landmark, road, locality, dealer name or PIN code"
          aria-label="Search place on Google Maps"
        />
        <button className="uc02-button uc02-button--primary" type="button" onClick={pinSearchLocation}>Search & Pin</button>
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
          <div className="uc02-outlet-location__pin-label"><span aria-hidden="true">●</span>{coordinates ? 'Exact device location pinned' : 'Map location preview'}</div>
        </div>
      ) : (
        <div className="uc02-outlet-location__empty">Search a place above, enter the outlet address, or choose <strong>Pin current location</strong> to show the map.</div>
      )}

      {coordinates && <div className="uc02-outlet-location__coordinates"><span>Latitude <strong>{coordinates.latitude.toFixed(6)}</strong></span><span>Longitude <strong>{coordinates.longitude.toFixed(6)}</strong></span></div>}
      {message.message && <div className={`uc02-outlet-location__message uc02-outlet-location__message--${message.kind}`} role="status">{message.message}</div>}
      <small className="uc02-outlet-location__note">Text search is for visual confirmation. Use Pin current location when an exact latitude/longitude must be stored.</small>
    </section>
  );
}

export default function ProjectAdminOutletLocationEnhancer() {
  const [mountTarget, setMountTarget] = useState<OutletLocationMount | null>(null);

  useEffect(() => {
    let currentHost: HTMLElement | null = null;
    let currentForm: HTMLFormElement | null = null;

    const clearCurrent = () => {
      currentHost?.remove();
      currentHost = null;
      currentForm = null;
    };

    const mount = () => {
      const form = findOutletForm();
      if (!form) {
        clearCurrent();
        setMountTarget(null);
        return;
      }
      if (currentHost?.isConnected && currentForm === form) return;
      clearCurrent();

      const nextHost = document.createElement('div');
      nextHost.className = 'uc02-outlet-location-host uc02-outlet-location-host--editor';
      const addressControl = findFieldControl(form, 'Address');
      const addressField = addressControl?.closest('label.uc02-field');
      if (addressField) addressField.insertAdjacentElement('afterend', nextHost);
      else form.appendChild(nextHost);

      currentHost = nextHost;
      currentForm = form;
      setMountTarget({ host: nextHost, form });
    };

    mount();
    const observer = new MutationObserver(mount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clearCurrent();
    };
  }, []);

  return mountTarget ? createPortal(<OutletLocationPanel form={mountTarget.form} />, mountTarget.host) : null;
}
