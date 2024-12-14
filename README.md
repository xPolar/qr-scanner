# qr-scanner

a command-line tool that scans all qr codes in a directory

## features

- batch processing of multiple image files
- concurrent processing for improved performance
- detailed logging of scan results
- supports common image formats
- saves results to a text file

## requirements

- node.js (v14 or higher)
- pnpm package manager

## installation

```bash
# clone the repository
git clone [your-repo-url]
cd qr-scanner

# install dependencies
pnpm install
```

## usage

1. place your images containing qr codes in the `input` directory

2. run the scanner:

```bash
pnpm start
```

3. check the results in `qr_results.txt`

## how it works

the tool uses:

- `jimp` for image processing
- `jsqr` for qr code detection
- concurrent processing based on available cpu cores
- organized output with progress tracking
