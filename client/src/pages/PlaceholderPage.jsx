import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mb-4">
        <Construction size={32} className="text-primary-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-500 max-w-md">{description}</p>
      <div className="mt-6 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg text-sm font-medium">
        Coming Soon
      </div>
    </div>
  );
}
