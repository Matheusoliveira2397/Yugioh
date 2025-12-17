import { useState } from 'react';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Calculator({ isOpen, onClose }: CalculatorProps) {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [shouldResetDisplay, setShouldResetDisplay] = useState(false);

  if (!isOpen) return null;

  const handleNumber = (num: string) => {
    if (shouldResetDisplay) {
      setDisplay(num);
      setShouldResetDisplay(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const handleOperation = (op: string) => {
    const current = parseFloat(display);
    
    if (previousValue !== null && operation && !shouldResetDisplay) {
      const result = calculate(previousValue, current, operation);
      setDisplay(String(result));
      setPreviousValue(result);
    } else {
      setPreviousValue(current);
    }
    
    setOperation(op);
    setShouldResetDisplay(true);
  };

  const calculate = (prev: number, curr: number, op: string): number => {
    switch (op) {
      case '+':
        return prev + curr;
      case '-':
        return prev - curr;
      case '×':
        return prev * curr;
      case '÷':
        return curr !== 0 ? prev / curr : 0;
      default:
        return curr;
    }
  };

  const handleEquals = () => {
    if (previousValue !== null && operation) {
      const current = parseFloat(display);
      const result = calculate(previousValue, current, operation);
      setDisplay(String(result));
      setPreviousValue(null);
      setOperation(null);
      setShouldResetDisplay(true);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setShouldResetDisplay(false);
  };

  const handleDecimal = () => {
    if (shouldResetDisplay) {
      setDisplay('0.');
      setShouldResetDisplay(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const buttons = [
    ['C', '⌫', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '='],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-4 shadow-2xl border-2 border-yellow-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-yellow-400">Calculadora</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Display */}
        <div className="bg-gray-900 rounded-lg p-4 mb-3 border-2 border-gray-700">
          <div className="text-right">
            {operation && previousValue !== null && (
              <div className="text-sm text-gray-400 mb-1">
                {previousValue} {operation}
              </div>
            )}
            <div className="text-3xl font-mono text-white break-all">
              {display}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="grid gap-2">
          {buttons.map((row, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-4 gap-2">
              {row.map((btn) => {
                const isNumber = !isNaN(Number(btn));
                const isOperation = ['+', '-', '×', '÷'].includes(btn);
                const isEquals = btn === '=';
                const isClear = btn === 'C';
                const isBackspace = btn === '⌫';
                const isDecimal = btn === '.';
                const isZero = btn === '0';

                let buttonClass = 'h-12 rounded-lg font-bold text-lg transition-all hover:scale-105 active:scale-95 ';

                if (isNumber || isDecimal) {
                  buttonClass += 'bg-gray-700 text-white hover:bg-gray-600';
                } else if (isOperation) {
                  buttonClass += 'bg-blue-600 text-white hover:bg-blue-500';
                } else if (isEquals) {
                  buttonClass += 'bg-green-600 text-white hover:bg-green-500 col-span-2';
                } else if (isClear) {
                  buttonClass += 'bg-red-600 text-white hover:bg-red-500 col-span-2';
                } else if (isBackspace) {
                  buttonClass += 'bg-orange-600 text-white hover:bg-orange-500';
                }

                if (isZero) {
                  buttonClass += ' col-span-2';
                }

                const handleClick = () => {
                  if (isNumber) {
                    handleNumber(btn);
                  } else if (isOperation) {
                    handleOperation(btn);
                  } else if (isEquals) {
                    handleEquals();
                  } else if (isClear) {
                    handleClear();
                  } else if (isBackspace) {
                    handleBackspace();
                  } else if (isDecimal) {
                    handleDecimal();
                  }
                };

                return (
                  <button
                    key={btn}
                    onClick={handleClick}
                    className={buttonClass}
                  >
                    {btn}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
