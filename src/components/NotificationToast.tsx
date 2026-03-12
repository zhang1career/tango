import React from 'react';
import {useNotification, type NotificationLevel} from '../context/NotificationContext';

const levelStyles: Record<NotificationLevel, React.CSSProperties> = {
  info: {backgroundColor: '#1e3a5f', borderLeftColor: '#3b82f6'},
  warning: {backgroundColor: '#3d2f0f', borderLeftColor: '#f59e0b'},
  error: {backgroundColor: '#3d1f1f', borderLeftColor: '#ef4444'},
};

export function NotificationToast() {
  const {notifications, removeNotification} = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '8px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <div style={{display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center'}}>
        {notifications.map((n) => (
          <div
            key={n.id}
            role="alert"
            style={{
              ...levelStyles[n.level],
              borderLeft: '4px solid',
              padding: '10px 16px',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              maxWidth: 480,
              width: '100%',
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
            onClick={() => removeNotification(n.id)}
          >
            {n.message}
          </div>
        ))}
      </div>
    </div>
  );
}
