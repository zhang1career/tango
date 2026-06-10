import React, {useMemo} from 'react';
import {editorStyles as styles} from '@/styles/editorStyles';
import {type IdNameDict, sortedDictIds} from '@/utils/id-name-dict';

/**
 * 字典下拉：option 显示名称，value/onChange 使用 id。
 */
export function IdNameSelect({
  dict,
  value,
  onChange,
  allowEmpty = false,
  placeholder = '请选择',
  disabled,
  style,
}: {
  dict: IdNameDict;
  value: string;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const ids = useMemo(() => sortedDictIds(dict, value ? [value] : []), [dict, value]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={style ?? styles.input}
    >
      {allowEmpty && !value ? <option value="">{placeholder}</option> : null}
      {ids.map((id) => (
        <option key={id} value={id}>
          {dict[id]}
        </option>
      ))}
    </select>
  );
}
