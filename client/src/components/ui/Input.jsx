import React from 'react';

// This is a generic, reusable Input component
const Input = ({ id, label, Icon, ...props }) => {
  return (
    <div>
      <label htmlFor={id} className="block mb-2 text-sm font-medium text-gray-300">
        {label}
      </label>
      <div className="relative">
        {/* We can pass an icon component as a prop */}
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />}
        <input
          id={id}
          className="pl-10 bg-gray-700/60 border border-gray-600 text-white text-sm rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 block w-full p-3 transition"
          {...props} // This passes down all other props like type, value, onChange, etc.
        />
      </div>
    </div>
  );
};

export default Input;