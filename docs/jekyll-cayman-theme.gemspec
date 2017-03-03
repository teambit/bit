# coding: utf-8

Gem::Specification.new do |spec|
  spec.name          = "jekyll-cayman-theme"
  spec.version       = "0.1.0"
  spec.authors       = ["Pietro F. Menna"]
  spec.email         = ["pietromenna@yahoo.com"]

  spec.summary       = %q{A Jekyll theme for the responsive theme for GitHub Pages http://jasonlong.github.io/cayman-theme/ }
  spec.homepage      = "https://github.com/pietromenna/jekyll-cayman-theme"
  spec.license       = "MIT"

  spec.files         = `git ls-files -z`.split("\x0").select { |f| f.match(%r{^(_layouts|_includes|_sass|LICENSE|README)/i}) }

  spec.add_development_dependency "jekyll", "~> 3.2"
  spec.add_development_dependency "bundler", "~> 1.12"
  spec.add_development_dependency "rake", "~> 10.0"
end