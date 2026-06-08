//go:build !darwin

package procattr

func lookup(_ string) Info { return Info{} }
