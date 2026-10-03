import PageDeco from '../PageDeco.jsx'
import ToastHost from '../Toast.jsx'
import MusicPlayer from '../MusicPlayer/MusicPlayer.jsx'

export default function Layout({ children }) {
  return (
    <div className="relative min-h-screen">
      <PageDeco />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
      <ToastHost />
      <MusicPlayer />
    </div>
  )
}
