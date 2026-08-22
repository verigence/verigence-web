import { useEffect, useState } from 'react';

import { auditCoreErrorMessage } from '../../services/audit-core/errorMessage';
import {
  getProjectReferenceData,
  type ProjectReferenceData,
} from '../../services/audit-core/projectReferenceData';
import { useSessionStore } from '../../store/sessionStore';

interface ProjectReferenceFieldsProps {
  oemId: string;
  productCategoryId: string;
  disabled: boolean;
  onOemChange: (oemId: string) => void;
  onProductCategoryChange: (productCategoryId: string) => void;
  onError: (message: string) => void;
}

export default function ProjectReferenceFields({
  oemId,
  productCategoryId,
  disabled,
  onOemChange,
  onProductCategoryChange,
  onError,
}: ProjectReferenceFieldsProps) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [referenceData, setReferenceData] = useState<ProjectReferenceData>({
    oems: [],
    productCategories: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    void getProjectReferenceData(accessToken)
      .then((value) => {
        if (!cancelled) setReferenceData(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(auditCoreErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, onError]);

  useEffect(() => {
    if (
      !disabled &&
      !productCategoryId &&
      referenceData.productCategories.length === 1
    ) {
      onProductCategoryChange(referenceData.productCategories[0].productCategoryId);
    }
  }, [disabled, onProductCategoryChange, productCategoryId, referenceData.productCategories]);

  const selectedOemExists = referenceData.oems.some((item) => item.oemId === oemId);
  const selectedCategoryExists = referenceData.productCategories.some(
    (item) => item.productCategoryId === productCategoryId,
  );

  return (
    <>
      <label className="uc02-field">
        <span>OEM</span>
        <select
          required
          disabled={disabled || loading}
          value={oemId}
          onChange={(event) => onOemChange(event.target.value)}
        >
          <option value="">{loading ? 'Loading OEMs…' : 'Select OEM'}</option>
          {oemId && !selectedOemExists && <option value={oemId}>Current selection</option>}
          {referenceData.oems.map((item) => (
            <option key={item.oemId} value={item.oemId}>{item.oemName}</option>
          ))}
        </select>
      </label>
      <label className="uc02-field">
        <span>Product Category</span>
        <select
          required
          disabled={disabled || loading}
          value={productCategoryId}
          onChange={(event) => onProductCategoryChange(event.target.value)}
        >
          <option value="">{loading ? 'Loading categories…' : 'Select product category'}</option>
          {productCategoryId && !selectedCategoryExists && (
            <option value={productCategoryId}>Current selection</option>
          )}
          {referenceData.productCategories.map((item) => (
            <option key={item.productCategoryId} value={item.productCategoryId}>
              {item.categoryName}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
