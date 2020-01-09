# Boring Gnome

This is an extension that I wrote for myself in order to make gnome-shell
bearable.  I wrote it almost a year ago, and surprisingly, it *still works*!  It
did break once after a Gnome update, but thankfully
[it was easy to fix](https://github.com/mishoo/boring-gnome-mishoo.github.com/commit/4dbbc211abee0c1338c53e4c458ee6bbe31f4757).

## Installation

I'm not taking the trouble to put it on
[https://extensions.gnome.org/](https://extensions.gnome.org/).

To install, paste the following in your favorite terminal:

```
mkdir -p ~/.local/share/gnome-shell/extensions/
cd ~/.local/share/gnome-shell/extensions/
git clone https://github.com/mishoo/boring-gnome-mishoo.github.com.git boring-gnome@mishoo.github.com
```

Then restart gnome-shell, and enable it in gnome-tweaks.

## What it does

- Nothing malicious, but feel free to [look at the code](./extension.js).  It's
  actually nice code, compared to many other extensions I've been through in
  order to write it.

- It adds the boring taskbar — that little area in the taskbar with buttons for
  each visible window.  You click on one to bring it to front, or you
  right-click to get the window menu, for instance to close it without bringing
  it to front.

  My extension hides the pointless “Activities” button, to leave more space for
  the taskbar.

- A “cycle workspaces” keybinding.  It doesn't cycle, in fact, it just toggles
  between the two most recently used workspaces.  I use this a lot, since the
  age of [IceWM](https://ice-wm.org/) (yeah, I'm *that* old :-/).  It took a
  couple of hours to implement it in Sawfish, one day to implement it in
  Metacity
  ([wrote about it here](http://mihai.bazon.net/blog/linus-bashes-gnome); the
  patch didn't get in, despite my best efforts, because it was a new feature and
  Gnome does not want or need features) and *several* days to do it in Gnome
  Shell (well, including all the rest).  That's how fun writing gnome-shell
  extension is!

  Cycle workspaces with `Super-Tab` or `Ctrl-Alt-Tab`.  Add `Shift` if you want
  to take the current window with you.

  Note that my extension disables the workspace switching animation.  I find it
  extremely annoying.  Switching workspaces must be *instant* (well, as instant
  as things can be in Gnome Shell, which is some kind of pig bloatware) and if
  you don't think so, my extension is not for you.

- Provides a popup that lists all open windows and you can quickly filter and
  select one by typing a few letters from the title or from the class.  Open it
  with `Ctrl-Super-r` or `Ctrl-Super-z`.  For example, to see Firefox windows, I
  press `Ctrl-Super-r` and type `fir` to filter the list.  Or if I want the
  particular FF window where Wire is open, I type `wire`.  You get the point,
  it's pretty much like Emacs' `ivy-mode`, except no fuzzy matching (not sure
  it's worth it).

  While the popup is open, you can use `Up`/`Down`/`Enter` to select window, or
  `Esc` to dismiss the popup.  I guess these are expected.  But if you're like
  me and like Emacs bindings too, you can also use `C-n`/`C-p` to move
  selection, `C-s`/`C-r` to rotate the list and `C-g` to dismiss.

- Just for fun: zoom in/out the current window with
  `Super-Page_up`/`Super-Page_Down`.  Add `Ctrl` to the mix to rotate the
  window.  When you're done, press `Super-Home` to bring it back to normal.
  It's unfortunate that mouse events don't work properly when the window is
  transformed; I blame Mutter for that — the actual window manager, for which
  gnome-shell is just some kind of plugin; the pig plugin.

- Set the brightness of the display by spinning your mouse wheel over the
  battery icon.  Nice feeling, isn't it?

So you see, it does a bunch of unrelated things, but nevertheless, things I
want.  Hence the name “Boring Gnome”.  I don't want to install several poorly
written extensions to get each item on this list, that's why I did it myself
(also, for the cycle workspaces and window finder I couldn't find any existing
extension).

There's no UI for customization, unfortunately, and I have zero incentives to
write one.  To customize the keybindings you need to look into
`schema.gschema.xml`, to add/remove features look into `extension.js`.  Note
that if you edit the XML file, you need to run `glib-compile-schemas .` in that
directory.  I suspect this is because parsing XML at runtime is just too slow
and Gnome likes to have it compiled.  Other projects seem to do well without
“compiling” XML-s, but let's optimize everything, shall we?  And then write the
shell in JavaScript and use a slow interpreter.

For any change you make, you need to restart gnome-shell in order to test it.
And pray it doesn't crash.  If it does crash, it's obviously your fault, not
gnome-shell's (it should be acceptable that a JavaScript extension can kill the
shell, right?).  If it fails to start at all (seriously, it can happen if you
make the slightest mistake in the XML, like forgetting the angular brackets in
`<Super>`), you can temporarily disable the extension by logging into a console
and run:

```
chmod 000 ~/.local/share/gnome-shell/extensions/boring-gnome@mishoo.github.com
```

Debug on your own sanity.

## Contribute...?

If you do anything interesting about this extension I'd like to hear about it.
If you don't, but still like it, would be nice to hear about it too.  Find me on
[lisperator.net](http://lisperator.net/).

## Too much sarcasm?

Actually, I'm refraining...  I started a big rant about it, but gave up
publishing it at some point, it won't do anybody any good.  Here's the short
version.

It took embarassingly long to write this extension.  Ideally it should be easy,
but several things concur to make it hard:

- There is literally no documentation.  The only way to learn how to write an
  extension is to read code from other extensions (most are poorly written),
  read code from gnome-shell itself (in a way, it's itself a big extension for
  Mutter) and look up the C API documentation of
  [Mutter](https://developer.gnome.org/meta/stable/),
  [Clutter](https://developer.gnome.org/clutter/stable/),
  [St](https://developer.gnome.org/st/) and other obscure projects you shouldn't
  know about.

- You need to restart the shell after *each* and *every* change.  If you're on
  Wayland, developing an extension becomes impossible, because restarting the
  shell kills all your applications.  You might contemplate killing yourself
  instead.  It's even worse than a C project.  Imagine you had to reboot after
  each change + recompilation.

  Back in 2000 a new window manager saw the light; it was named Sawmill (and
  later, [Sawfish](https://en.wikipedia.org/wiki/Sawfish_(window_manager))).
  Its author, John Harper, is a real man and knows that C sucks, so he wrote for
  himself a Lisp interpreter (well, more factually accurate, he “borrowed” most
  of it from Emacs), and then wrote Sawfish in Lisp.  It became the official
  window manager in Gnome.  It was *fast*; it ran fine with 64MB or RAM.  It was
  *documented*.  You could change it in *real-time without restarting it*.  For
  programmers, at least, it was the dream WM — but it came with sane defaults
  and ordinary people could use it as well without asking questions.

  Somehow, the original author had to quit for his own reasons and Gnome quickly
  [threw it away](https://blogs.gnome.org/uraeus/2007/02/17/on-sawfish-metacity-and-linus/)!
  That's a pity and a shame!  I'm sure Gnome could have found the resources to
  continue this project.  But “nobody were interested/felt qualified to take
  over it!”  A fast WM, with a coherent and well documented API, configurable
  and programmable in real time — they dropped it on the floor, to start from
  scratch with a new monster in C!  It's the
  [CADT syndrome](https://www.jwz.org/doc/cadt.html) all over.

  I stayed with Sawfish for well over a decade, and it still works today; but
  unmaintained it is, and it shows.  So yeah, I'm pissed off.

Writing gnome-shell extensions is a big pain in the ass and I won't be surprised
if this one breaks again on some future Gnome update.  But that's okay, right?
Essentially, we're all using undocumented APIs here.

**End of the short version of my rant.**

## License: MIT
