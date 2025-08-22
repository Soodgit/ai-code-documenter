import React from 'react';

const Button = ({ isLoading, children, ...props }) => {
  return (
    <button
      disabled={isLoading}
      className="w-full text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:ring-4 focus:outline-none focus:ring-blue-800 font-medium rounded-lg text-sm px-5 py-3 text-center mt-4 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      {...props}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
};

export default Button;