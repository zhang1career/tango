/**
 * 右侧抽屉 - 鼠标移到屏幕右边缘时自动展开
 */

import React, {useState} from 'react';

const EDGE_WIDTH = 20;
const DRAWER_WIDTH = 220;

interface RightDrawerProps {
  children: React.ReactNode;
}

export function RightDrawer({children}: RightDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: open ? DRAWER_WIDTH : EDGE_WIDTH,
        height: '100vh',
        backgroundColor: open ? '#1a1a2e' : 'transparent',
        borderLeft: '1px solid #333',
        zIndex: 1000,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        cursor: 'default',
        boxShadow: open ? '-4px 0 12px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {open ? (
        <div style={{padding: 16, width: DRAWER_WIDTH, minHeight: '100%'}}>
          {children}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: 2,
            transform: 'translateY(-50%)',
            color: '#555',
            fontSize: 11,
            writingMode: 'vertical-rl',
          }}
        >
          展开
        </div>
      )}
    </div>
  );
}
