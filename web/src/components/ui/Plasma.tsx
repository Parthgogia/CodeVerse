import { useEffect, useRef } from 'react';

interface PlasmaProps {
  speed?:           number;   // 1.6
  color?:           string;   // '4413e7'
  opacity?:         number;   // 0.5
  mouseInteractive?: boolean; // true
  scale?:           number;   // 1.2
  direction?:       'normal' | 'reverse' | 'pingpong'; // 'pingpong'
  style?:           React.CSSProperties;
}

export function Plasma({
  speed           = 1.6,
  color           = '4413e7',
  opacity         = 0.5,
  mouseInteractive = true,
  scale           = 1.2,
  direction       = 'pingpong',
  style,
}: PlasmaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: true });
    if (!gl) return;

    // ── Parse hex colour → vec3 ─────────────────────────────
    const hex   = color.replace('#', '');
    const r     = parseInt(hex.slice(0, 2), 16) / 255;
    const g     = parseInt(hex.slice(2, 4), 16) / 255;
    const b     = parseInt(hex.slice(4, 6), 16) / 255;

    // ── Shaders ─────────────────────────────────────────────
    const vertSrc = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;

    const fragSrc = `
      precision mediump float;

      uniform float u_time;
      uniform vec2  u_res;
      uniform vec2  u_mouse;
      uniform vec3  u_color;
      uniform float u_scale;
      uniform float u_opacity;

      float plasma(vec2 p, float t) {
        float v = 0.0;
        v += sin(p.x * 1.8 + t);
        v += sin(p.y * 1.5 + t * 0.8);
        v += sin((p.x + p.y) * 1.2 + t * 1.1);
        float cx = p.x + 0.5 * sin(t * 0.4);
        float cy = p.y + 0.5 * cos(t * 0.3);
        v += sin(sqrt(cx * cx + cy * cy) * 3.0 + t);
        return v;
      }

      void main() {
        vec2 uv  = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
        uv.x    *= u_res.x / u_res.y;
        uv      *= u_scale;

        // Mouse interaction — subtle warp
        vec2 mouse = (u_mouse / u_res) * 2.0 - 1.0;
        mouse.x   *= u_res.x / u_res.y;
        float dist = length(uv - mouse);
        uv += (uv - mouse) * 0.04 / (dist + 0.5);

        float v  = plasma(uv, u_time);
        // Map -4..4 → 0..1
        float n  = (v + 4.0) / 8.0;

        // Colour shift based on plasma value
        vec3 col = u_color;
        col     += vec3(n * 0.18, n * 0.08, -n * 0.12);
        col      = clamp(col, 0.0, 1.0);

        // Soft alpha pulse
        float alpha = u_opacity * (0.72 + 0.28 * sin(v * 1.5));
        gl_FragColor = vec4(col, alpha);
      }
    `;

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      return s;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uTime   = gl.getUniformLocation(prog, 'u_time');
    const uRes    = gl.getUniformLocation(prog, 'u_res');
    const uMouse  = gl.getUniformLocation(prog, 'u_mouse');
    const uColor  = gl.getUniformLocation(prog, 'u_color');
    const uScale  = gl.getUniformLocation(prog, 'u_scale');
    const uOpacity= gl.getUniformLocation(prog, 'u_opacity');

    gl.uniform3f(uColor, r, g, b);
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uOpacity, opacity);

    // Blend
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // ── Resize ──────────────────────────────────────────────
    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Mouse ───────────────────────────────────────────────
    let mx = canvas.width  / 2;
    let my = canvas.height / 2;
    const onMouse = (e: MouseEvent) => {
      if (!mouseInteractive) return;
      const rect = canvas.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = canvas.height - (e.clientY - rect.top);
    };
    window.addEventListener('mousemove', onMouse);

    // ── Animation loop ───────────────────────────────────────
    let raf: number;
    let t   = 0;
    let dt  = speed * 0.012;
    let dir = 1;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;

      if (direction === 'pingpong') {
        t += dt * dir * delta * 60;
        if (t > 80 || t < 0) dir *= -1;
      } else if (direction === 'reverse') {
        t -= dt * delta * 60;
      } else {
        t += dt * delta * 60;
      }

      gl.uniform1f(uTime,  t);
      gl.uniform2f(uRes,   canvas.width, canvas.height);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouse);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [speed, color, opacity, mouseInteractive, scale, direction]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: mouseInteractive ? 'auto' : 'none',
        ...style,
      }}
    />
  );
}
