require "language/node"
class Bit < Formula
  desc ""
  homepage ""
  url ""
  sha256 ""

    depends_on "node"

  def install
    system "npm", "install" ,"-g" ,*Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]# if this fails, try separate make/make install steps
  end

end
