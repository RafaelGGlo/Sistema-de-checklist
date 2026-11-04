import React, { forwardRef, useImperativeHandle, useRef } from 'react';

export default forwardRef(function Assinatura({ onOK, onEmpty, onBegin, onLoadEnd }, ref) {
  const canvas = useRef(null);
  const desenhando = useRef(false);
  const preenchida = useRef(false);
  useImperativeHandle(ref, () => ({
    readSignature() { preenchida.current ? onOK(canvas.current.toDataURL('image/png')) : onEmpty(); },
    clearSignature() {
      const c = canvas.current;
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      preenchida.current = false;
    },
  }));
  function ponto(event) {
    const c = canvas.current, rect = c.getBoundingClientRect();
    return [(event.clientX - rect.left) * c.width / rect.width, (event.clientY - rect.top) * c.height / rect.height];
  }
  return <canvas aria-label="Quadro de assinatura do motorista" ref={element => {
    canvas.current = element;
    if (element) onLoadEnd?.();
  }} width={1000} height={600} style={{ width: '100%', height: '100%', touchAction: 'none', background: '#fff' }}
    onPointerDown={event => {
      event.currentTarget.setPointerCapture(event.pointerId);
      desenhando.current = true; preenchida.current = true; onBegin?.();
      const ctx = canvas.current.getContext('2d'), [x, y] = ponto(event);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    }} onPointerMove={event => {
      if (!desenhando.current) return;
      const ctx = canvas.current.getContext('2d'); ctx.lineTo(...ponto(event)); ctx.stroke();
    }} onPointerUp={() => { desenhando.current = false; }} onPointerCancel={() => { desenhando.current = false; }} />;
});
