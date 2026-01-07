interface BudgetHeaderProps {
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function BudgetHeader({ month, year, onMonthChange }: BudgetHeaderProps) {
  const handlePrevMonth = () => {
    if (month === 0) {
      onMonthChange(11, year - 1);
    } else {
      onMonthChange(month - 1, year);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onMonthChange(0, year + 1);
    } else {
      onMonthChange(month + 1, year);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Zero-Based Budget</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevMonth}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            ←
          </button>
          <div className="text-xl font-semibold text-gray-900 min-w-[200px] text-center">
            {months[month]} {year}
          </div>
          <button
            onClick={handleNextMonth}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}