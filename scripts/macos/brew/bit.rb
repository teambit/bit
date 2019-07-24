require "language/node"

class Bit < Formula
  desc "Distributed Code Component Manager"
  homepage "https://bit.dev"
  url "https://registry.npmjs.org/bit-bin/-/bit-bin-14.2.0.tgz"
  sha256 "078d6fb3cbe6cfa8e4aa7d100a80669f3ba1dc90f01d9ec652dcc36adc5840de"
  head "https://github.com/teambit/bit.git"

  bottle do
    sha256 "04c8c01c8855d9c4cbc3434ec345ff3a84b9d728730518d686e7435d7c1e832a" => :mojave
    sha256 "08fcb0686b049e75d6bef1f1cec8399cd3edb90b8488fb7f5fcf17e00fdaf428" => :high_sierra
    sha256 "bc510bb1aa7a6f2821b2dcbc1f0f43f90dce553c17c43fcefb8c26c8cfd634aa" => :sierra
  end

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    (testpath/"Library/Caches/Bit/config/config.json").write <<~EOS
      { "analytics_reporting": false, "error_reporting": false }
    EOS
    output = shell_output("#{bin}/bit init --skip-update")
    assert_match "successfully initialized", output
  end
end
