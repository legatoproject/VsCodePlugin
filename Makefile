# Makefile for Legato VSCode extension
.SILENT:
.PHONY: package setup all clean ci tests
PACKDIR:=package
OUTPUTDIR:=output
VERSION:=$(shell git describe --tags)

all: setup package

ci: setup tests package

clean:
	rm -Rf $(PACKDIR) $(OUTPUTDIR) out node_modules

setup:
	mkdir -p $(PACKDIR)
	cp -a `find -mindepth 1 -maxdepth 1 ! -name $(PACKDIR) ! -name out ! -name node_modules ! -name ".git*"` $(PACKDIR)
	jq '. + {version: "$(VERSION)"}' package.json > $(PACKDIR)/package.json
	cd $(PACKDIR) && npm install

package:
	mkdir -p $(OUTPUTDIR)
	cd $(PACKDIR) && yes | vsce package
	cp $(PACKDIR)/*.vsix $(OUTPUTDIR)
	cd $(OUTPUTDIR) && ln -s *.vsix legato-plugin-latest.vsix

tests:
	cd $(PACKDIR) && npm test
