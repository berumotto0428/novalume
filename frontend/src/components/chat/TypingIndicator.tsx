export default function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <img
        src="/bot-avatar.png"
        alt="Nova"
        className="h-8 w-8 rounded-full object-cover shrink-0 mt-1"
      />
      <div className="bg-white text-gray-800 rounded-2xl rounded-tl-sm px-4 py-3.5 border border-brand-100 shadow-card">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '200ms' }} />
          <span className="h-2 w-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '400ms' }} />
        </div>
      </div>
    </div>
  )
}
