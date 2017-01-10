require "language/node"
class Bit < Formula
  desc "Distributed Code Component Manager"
  homepage "http://www.bitsrc.io"
  url ""
  sha256 ""

  depends_on "node"

  def install
    system "npm", "install", "-g", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system bin/"bit", "--version"
  end
end