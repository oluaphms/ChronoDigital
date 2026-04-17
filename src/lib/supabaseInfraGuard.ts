let infraFatalMessage: string | null = null;

export function setSupabaseInfraFatal(message: string): void {
  infraFatalMessage = message;
}

export function getSupabaseInfraFatal(): string | null {
  return infraFatalMessage;
}

export function showFatalError(message: string): void {
  if (typeof document === 'undefined') return;
  let root = document.getElementById('root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div style="
      display:flex;
      height:100vh;
      align-items:center;
      justify-content:center;
      font-family:system-ui,-apple-system,sans-serif;
      background:#0f172a;
      color:#fff;
      padding:24px;
      text-align:center;
    ">
      <div style="max-width:640px">
        <h1 style="margin:0 0 12px 0">Erro de Conexao</h1>
        <p style="margin:0;line-height:1.5">${message}</p>
      </div>
    </div>
  `;
}

