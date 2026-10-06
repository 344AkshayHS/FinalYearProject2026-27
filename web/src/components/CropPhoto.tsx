// Crop photos, as on the phone (frontend/src/components/crop-photo.tsx).

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { fileUrl } from '~/lib/api';
import { useApp } from '~/lib/app-context';
import { findCrop, mainPhoto, type CropPhoto } from '@/lib/crops';
import { cropName } from '@/lib/translations';

// The address of a crop's page
export function cropPath(crop: string) {
  return '/crop/' + encodeURIComponent(crop);
}

// A crop photo from the backend (crop-images/). A light green box with a seedling shows while the photo loads,
// and stays if it cannot load (no internet, backend off): the farmer never sees a broken picture.
// className sets the size (styles.css).
export function PhotoBox({ photo, className }: { photo: CropPhoto | null; className: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  return (
    <span className={`photo-box ${className}`}>
      <span className="photo-placeholder" aria-hidden="true">
        🌱
      </span>
      {photo && failedPath !== photo.path && (
        <img src={fileUrl(photo.path)} alt="" loading="lazy" onError={() => setFailedPath(photo.path)} />
      )}
    </span>
  );
}

// A crop's photo in a list: the harvested crop, as farmers see it at the market
export function CropThumb({ crop, className = 'photo-thumb' }: { crop: string; className?: string }) {
  const { crops } = useApp();
  return <PhotoBox photo={mainPhoto(findCrop(crops, crop))} className={className} />;
}

// One crop in a list: its photo, its name and a figure on the right. A click opens the crop's page.
export function CropRowLink({ crop, right, children }: { crop: string; right?: string; children?: ReactNode }) {
  const { language } = useApp();
  return (
    <Link to={cropPath(crop)} className="crop-row">
      <CropThumb crop={crop} />
      <div className="crop-row-text">
        <div className="row-between">
          <span className="big-text bold">{cropName(crop, language)}</span>
          {right && <span className="note number">{right}</span>}
        </div>
        {children}
      </div>
      <span className="crop-row-arrow" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
