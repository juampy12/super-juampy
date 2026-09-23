"use client";

interface Props {
  message: string;
  onRetry: () => void;
}

/** Error de fetch visible con botón para reintentar sin esperar el próximo poll. */
export function ErrorRetry({ message, onRetry }: Props) {
  return (
    <div className="error">
      <span>No pude cargar los datos: {message}</span>
      <button type="button" onClick={onRetry}>
        Reintentar
      </button>
      <style jsx>{`
        .error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          background: #fdf1f1;
          color: #cc2020;
          border: 1px solid #f3c4c4;
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 14px;
        }
        button {
          flex: 0 0 auto;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid #cc2020;
          background: #fff;
          color: #cc2020;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        button:hover {
          background: #fdf1f1;
        }
      `}</style>
    </div>
  );
}
