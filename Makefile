# Makefile for Legato VSCode extension
.SILENT:
.PHONY: package setup all clean ci testVscode testPython leafWorkspace leaf delivery
PACKDIR:=package
OUTPUTDIR:=output
LEAFDIR:=leaf/out
VERSION:=$(shell git describe --tags)
LEAF_TEST_WORKSPACE?=$(PWD)/leafWorkspace
LEAF_TEST_SDK?=swi-wp76

all: setup package

ci: setup leafWorkspace testPython testVscode package leaf delivery

clean:
	rm -Rf $(PACKDIR) $(OUTPUTDIR) $(LEAF_TEST_WORKSPACE) out node_modules
	make -C leaf clean

setup:
	mkdir -p $(PACKDIR)
	cp -a `find -mindepth 1 -maxdepth 1 ! -name $(PACKDIR) ! -name out ! -name node_modules ! -name ".git*"` $(PACKDIR)
	jq '. + {version: "$(VERSION)"}' package.json > $(PACKDIR)/package.json
	cd $(PACKDIR) && npm install

package:
	cd $(PACKDIR) && yes | vsce package

leafWorkspace:
	rm -Rf $(LEAF_TEST_WORKSPACE)
	mkdir -p $(LEAF_TEST_WORKSPACE)
	yes | leaf -w $(LEAF_TEST_WORKSPACE) setup -p $(LEAF_TEST_SDK)
	cp -a src/test/resources/* $(LEAF_TEST_WORKSPACE)

testVscode:
	export CODE_TESTS_WORKSPACE=$(LEAF_TEST_WORKSPACE) && \
	cd $(PACKDIR) && \
	npm test

testPython:
	export LEAF_TEST_WORKSPACE=$(LEAF_TEST_WORKSPACE) && \
	python3 -m unittest python-src/test/test*.py

leaf:
	make -C leaf

delivery:
	mkdir -p $(OUTPUTDIR)
	cp $(PACKDIR)/*.vsix $(OUTPUTDIR)
	cd $(OUTPUTDIR) && ln -s *.vsix legato-plugin-latest.vsix
	cp $(LEAFDIR)/*.leaf $(LEAFDIR)/index.json $(OUTPUTDIR)
